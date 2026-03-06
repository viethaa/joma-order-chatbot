import express from 'express';
import { chromium } from 'playwright';

console.log('[startup] Server starting...');
console.log('[startup] Node version:', process.version);
console.log('[startup] PORT:', process.env.PORT);

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

const IPOS_URL = 'https://order.ipos.vn/menu?pos_parent=BRAND-3M93&pos_id=117850&source=DEFAULT';
const IPOS_MENU_API = 'https://weborder.ipos.vn/api/v1/menu?pos_parent=BRAND-3M93&pos_id=117850';

/* ─── Fetch live menu → map storeItemId to Vietnamese name ─── */
async function fetchViNames(cart) {
  try {
    const res = await fetch(IPOS_MENU_API);
    const data = await res.json();
    if (data.error !== 0) return cart;
    const items = data.data.items;

    return cart.map((cartItem) => {
      let live = items.find((i) => i.store_item_id === cartItem.storeItemId);
      if (!live) {
        const kws = cartItem.name.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
        for (const kw of kws) {
          live = items.find((i) => i.name?.toLowerCase().includes(kw));
          if (live) break;
        }
      }
      return { ...cartItem, viName: live?.name || cartItem.name };
    });
  } catch {
    return cart;
  }
}

/* ─── Main automation ─── */
async function placeOrderOnWebsite({ cart, pickupTime, customerName, studentId }) {
  const cartWithNames = await fetchViNames(cart);
  console.log('[order] Cart with VI names:', cartWithNames.map(i => `${i.viName} x${i.qty}`).join(', '));

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  try {
    // Block images/fonts/media to speed up
    await page.route('**/*', (route) => {
      if (['image', 'font', 'media'].includes(route.request().resourceType())) {
        route.abort();
      } else {
        route.continue();
      }
    });

    console.log('[browser] Navigating to iPos...');
    await page.goto(IPOS_URL, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);

    // ── Dismiss consent popup ──
    try {
      const understood = page.getByRole('button', {
        name: /đã hiểu|understood|got it|agree|accept|đồng ý|tiếp tục/i,
      });
      if (await understood.count() > 0) {
        await understood.first().click();
        console.log('[browser] Dismissed consent popup');
        await page.waitForTimeout(800);
      }
    } catch { /* no popup */ }

    // ── Add each item ──
    for (const item of cartWithNames) {
      const searchTerm = item.viName.replace(/\s*\([^)]*\)\s*/g, '').trim();
      console.log(`[browser] Searching: "${searchTerm}" x${item.qty}`);

      // Fill search via evaluate (Vue reactivity)
      await page.evaluate((term) => {
        const inp =
          document.querySelector('input[placeholder*="tìm"]') ||
          Array.from(document.querySelectorAll('input')).find(
            (i) => i.placeholder.includes('tìm') || i.placeholder.toLowerCase().includes('search')
          );
        if (!inp) return;
        inp.focus();
        inp.value = term;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }, searchTerm);

      await page.waitForTimeout(1200);

      for (let q = 0; q < item.qty; q++) {
        // Click the btn-add-cart for this item
        const clicked = await page.evaluate((term) => {
          const keyword = term.toLowerCase().split(/\s+/)[0];

          // Find all btn-add-cart elements
          const addBtns = Array.from(
            document.querySelectorAll('[class*="btn-add-cart"], [class*="btn__add"], [class*="add-to-cart"]')
          );

          const isVisible = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          };

          const isBlocked = (el) =>
            el.closest('[class*="out-of-stock"]') ||
            el.closest('[class*="sold-out"]') ||
            el.disabled;

          // Pass 1: add button inside a container that mentions the item keyword
          for (const btn of addBtns) {
            if (!isVisible(btn) || isBlocked(btn)) continue;
            const container = btn.closest(
              '[class*="item"], [class*="product"], [class*="food"], [class*="dish"], li'
            );
            if (container?.textContent.toLowerCase().includes(keyword)) {
              btn.click();
              return 'near-item';
            }
          }

          // Pass 2: first visible add btn
          for (const btn of addBtns) {
            if (!isVisible(btn) || isBlocked(btn)) continue;
            btn.click();
            return 'first-visible';
          }

          // Pass 3: any element with exactly "+" text that is small (not nav)
          const plusEls = Array.from(
            document.querySelectorAll('button, [role="button"], [class*="cs-touch"]')
          ).filter((el) => el.textContent.trim() === '+' && isVisible(el) && !isBlocked(el));
          if (plusEls.length > 0) {
            plusEls[0].click();
            return 'plus-text';
          }

          return false;
        }, searchTerm);

        if (!clicked) {
          await page.screenshot({ path: `/tmp/fail-${item.storeItemId || item.name}.png` });
          throw new Error(`Could not find add button for: ${item.name} (${item.viName})`);
        }
        console.log(`[browser] Add click ${q + 1}/${item.qty} → strategy: ${clicked}`);

        // ── Handle product detail dialog (customizations) ──
        // Use Playwright locator so it waits for CSS animation to complete
        const dialog = page.locator('.product-detail__dialog, [class*="item-buy-detail"]');
        const dialogVisible = await dialog.isVisible().catch(() => false);

        if (!dialogVisible) {
          // Give it up to 1.5s to slide in
          await dialog.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
        }

        if (await dialog.isVisible().catch(() => false)) {
          console.log('[browser] Product detail dialog opened');

          // Find and click the CTA button inside dialog
          const confirmed = await page.evaluate(() => {
            const dialog = document.querySelector('.product-detail__dialog, [class*="item-buy-detail"]');
            if (!dialog) return null;

            // All buttons/clickables in dialog
            const btns = Array.from(
              dialog.querySelectorAll(
                'button, [role="button"], [class*="btn-add"], [class*="add-to"], [class*="confirm"], [class*="order-btn"], [class*="btn-order"], [class*="btn__add"]'
              )
            );

            const isVisible = (el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            };

            // Priority: button with Vietnamese confirm text
            for (const btn of btns) {
              if (!isVisible(btn)) continue;
              const txt = btn.textContent.trim().toLowerCase();
              if (/thêm|xác nhận|đặt|order/i.test(txt)) {
                btn.click();
                return 'confirm-text: ' + txt;
              }
            }

            // Fallback: last visible button in dialog (CTA is usually at bottom)
            const visible = btns.filter(isVisible);
            if (visible.length > 0) {
              const last = visible[visible.length - 1];
              last.click();
              return 'last-btn: ' + last.textContent.trim().slice(0, 20);
            }

            return null;
          });

          if (confirmed) {
            console.log(`[browser] Dialog confirmed: "${confirmed}"`);
          } else {
            console.warn('[browser] Dialog open but no confirm button found — trying Playwright click');
            // Try Playwright native click on common confirm selectors
            const confirmBtn = dialog.locator(
              'button:has-text("Thêm"), button:has-text("Xác nhận"), button:has-text("Đặt"), button:last-of-type'
            ).first();
            await confirmBtn.click({ force: true }).catch(() => {});
          }

          await page.waitForTimeout(800);

          // Wait for dialog to close
          await dialog.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
        } else {
          // No dialog — item was added directly
          await page.waitForTimeout(500);
        }
      }

      // Clear search for next item
      await page.evaluate(() => {
        const inp =
          document.querySelector('input[placeholder*="tìm"]') ||
          Array.from(document.querySelectorAll('input')).find((i) =>
            i.placeholder.includes('tìm')
          );
        if (!inp) return;
        inp.value = '';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForTimeout(300);
    }

    // ── Open cart / checkout ──
    console.log('[browser] Opening cart...');

    // Wait for cart bottom bar
    await page.waitForSelector('.component__order-group__module', {
      state: 'visible',
      timeout: 8000,
    }).catch(() => console.warn('[browser] Cart bar not found via waitForSelector'));

    const cartClicked = await page.evaluate(() => {
      // Try the full cart module first
      const module = document.querySelector('.component__order-group__module');
      if (module) {
        const r = module.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          module.click();
          return 'order-group__module';
        }
        // Click a child touch element
        const touch = module.querySelector('[class*="cs-touch"], [class*="btn-order"], button');
        if (touch) {
          touch.click();
          return 'module-child: ' + touch.className;
        }
      }

      // Fallback: any bottom-fixed element with order/cart text
      const fixedEls = Array.from(document.querySelectorAll('[class*="order"], [class*="cart"], [class*="checkout"]'));
      for (const el of fixedEls) {
        const style = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (
          (style.position === 'fixed' || style.position === 'sticky') &&
          r.bottom > window.innerHeight * 0.7 &&
          r.width > 0 &&
          r.height > 0
        ) {
          el.click();
          return 'fixed-bottom: ' + el.className.slice(0, 50);
        }
      }
      return false;
    });

    console.log('[browser] Cart click result:', cartClicked);
    await page.waitForTimeout(2000);

    // ── Fill checkout form ──
    console.log('[browser] Filling checkout form...');

    // Name
    const nameInput = page.locator(
      'input[placeholder*="tên" i], input[placeholder*="name" i], input[placeholder*="họ" i], input[name*="name" i], input[name*="customer" i]'
    ).first();
    if (await nameInput.count() > 0) {
      await nameInput.fill(`${customerName} - ${studentId}`, { force: true });
      console.log('[browser] Filled name field');
    }

    // Phone (use student ID digits, padded to 10)
    const phoneDigits = studentId.replace(/\D/g, '').padEnd(10, '0').slice(0, 10);
    const phoneInput = page.locator(
      'input[type="tel"], input[placeholder*="điện thoại" i], input[placeholder*="phone" i], input[placeholder*="số" i]'
    ).first();
    if (await phoneInput.count() > 0) {
      await phoneInput.fill(phoneDigits, { force: true });
      console.log('[browser] Filled phone field');
    }

    // Note
    const note = `${customerName} - ${studentId} | Pickup: ${pickupTime} | ${cart.map((i) => `${i.name} x${i.qty}`).join(', ')}`;
    const noteInput = page.locator(
      'textarea, input[placeholder*="ghi chú" i], input[placeholder*="note" i], input[placeholder*="ghi" i]'
    ).first();
    if (await noteInput.count() > 0) {
      await noteInput.fill(note, { force: true });
      console.log('[browser] Filled note field');
    }

    // ── Submit ──
    console.log('[browser] Submitting order...');
    await page.screenshot({ path: '/tmp/before-submit.png' });

    const submitBtn = page.locator(
      'button:has-text("Xác nhận"), button:has-text("Đặt hàng"), button:has-text("Đặt"), button[type="submit"], button:has-text("Order")'
    ).first();

    if (await submitBtn.count() > 0) {
      await submitBtn.click({ force: true });
    } else {
      // Fallback: find any primary/submit-like button
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const submit = btns.find((b) => {
          const txt = b.textContent.trim().toLowerCase();
          return /xác nhận|đặt|order|submit/i.test(txt);
        });
        if (submit) submit.click();
      });
    }

    await page.waitForTimeout(3000);

    // ── Extract order code ──
    await page.screenshot({ path: '/tmp/after-submit.png' });

    const orderCode = await page.evaluate(() => {
      const el = document.querySelector('[class*="order-code"], [class*="foodbook"], [class*="code"]');
      if (el) return el.textContent.trim();
      // Try reading any prominent number shown after submit
      const allText = document.body.innerText;
      const match = allText.match(/[A-Z]{2,4}[-\s]?\d{4,8}/);
      return match?.[0] || null;
    });

    console.log('[browser] Order placed! Code:', orderCode);
    return { orderCode: orderCode || 'CHECK_IPOS', success: true };

  } finally {
    await context.close();
    await browser.close();
  }
}

/* ─── Routes ─── */
app.post('/order', async (req, res) => {
  const { cart, pickupTime, customerName, studentId } = req.body;
  if (!cart?.length) return res.status(400).json({ error: 'No items in cart' });

  console.log(`[order] ${customerName} - ${studentId} | ${cart.map((i) => `${i.name} x${i.qty}`).join(', ')} | ${pickupTime}`);

  try {
    const result = await placeOrderOnWebsite({ cart, pickupTime, customerName, studentId });
    res.json(result);
  } catch (err) {
    console.error('[order] Failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Joma order server running on port ${PORT}`));
