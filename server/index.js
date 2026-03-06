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
      // Match by storeItemId first
      let live = items.find((i) => i.store_item_id === cartItem.storeItemId);
      // Fallback: match by keyword in name
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
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'vi-VN',
  });
  // Mask automation signals
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();

  try {
    // Block images/fonts to speed up
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
    await page.screenshot({ path: '/tmp/initial-load.png' });

    // Dump page HTML snippet to see what rendered
    const htmlSnippet = await page.evaluate(() => document.body.innerHTML.slice(0, 5000));
    console.log('[debug] page HTML:', htmlSnippet);

    // Dismiss "understood" / consent popup using Playwright native click (more reliable)
    try {
      const understood = page.getByRole('button', { name: /understood|got it|agree|accept|đã hiểu|đồng ý|tiếp tục/i });
      const count = await understood.count();
      if (count > 0) {
        await understood.first().click();
        console.log('[browser] Dismissed consent popup');
        await page.waitForTimeout(1000);
      }
    } catch { /* no popup */ }

    await page.screenshot({ path: '/tmp/after-dismiss.png' });

    // ── Add each item ──
    const searchInput = page.locator('input[placeholder]').first();

    for (const item of cartWithNames) {
      // Strip English parenthetical "(Thai Milk Tea)" → cleaner search
      const searchTerm = item.viName.replace(/\s*\([^)]*\)\s*/g, '').trim();
      console.log(`[browser] Adding: "${searchTerm}" x${item.qty}`);

      await searchInput.scrollIntoViewIfNeeded();
      await searchInput.fill(searchTerm, { force: true });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `/tmp/search-${item.storeItemId || item.name}.png` });

      for (let q = 0; q < item.qty; q++) {
        // Dump all clickable elements (buttons AND iPos div-based touch targets)
        const btnDump = await page.evaluate(() => {
          const sel = 'button, [role="button"], [class*="cs-touch"], [class*="btn__"], [class*="add"], [class*="plus"]';
          return Array.from(document.querySelectorAll(sel)).slice(0, 30).map(b => ({
            tag: b.tagName,
            txt: b.textContent.trim().slice(0, 40),
            cls: (b.className?.toString() || '').slice(0, 80),
            visible: (() => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })(),
          }));
        });
        console.log('[debug] clickables after search:', JSON.stringify(btnDump));

        const added = await page.evaluate((term) => {
          // iPos uses div.component__cs-touch for all interactive elements
          const CLICKABLE = 'button, [role="button"], [class*="cs-touch"], [class*="btn__"], [class*="btn-"], [class*="touch"], [class*="add"]';
          const allEls = Array.from(document.querySelectorAll(CLICKABLE));

          const isVisible = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          };

          const isBlocked = (el) =>
            el.closest('[class*="out-of-stock"]') || el.closest('[class*="sold-out"]') ||
            el.disabled || el.getAttribute('disabled') != null;

          const isAddEl = (el) => {
            const txt = el.textContent.trim();
            const cls = (el.className?.toString() || '').toLowerCase();
            return txt === '+' || txt.toLowerCase() === 'add' ||
              /btn-add-cart|btn__add|add-item|item-add/i.test(cls) ||
              /\bplus\b/i.test(cls);
          };

          // Pass 1: element looks like an add button AND is near the item name
          const keyword = term.toLowerCase().split(/\s+/)[0];
          for (const el of allEls) {
            if (!isAddEl(el) || isBlocked(el) || !isVisible(el)) continue;
            const container = el.closest('[class*="item"], [class*="product"], [class*="food"], [class*="dish"], [class*="menu"], li');
            if (container?.textContent.toLowerCase().includes(keyword)) {
              el.click();
              return 'near-item';
            }
          }

          // Pass 2: first visible add-like element anywhere
          for (const el of allEls) {
            if (!isAddEl(el) || isBlocked(el) || !isVisible(el)) continue;
            const cls = (el.className?.toString() || '').toLowerCase();
            if (/close|back|prev|nav|bag|search|clear|lang|flag/i.test(cls)) continue;
            el.click();
            return 'first-visible';
          }

          // Pass 3: any small visible element with "+" text
          for (const el of allEls) {
            if (isBlocked(el) || !isVisible(el)) continue;
            if (el.textContent.trim() === '+') {
              el.click();
              return 'plus-text';
            }
          }

          return false;
        }, searchTerm);

        if (!added) {
          await page.screenshot({ path: `/tmp/debug-fail-${item.storeItemId || item.name}.png` });
          throw new Error(`Could not find add button for: ${item.name} (${item.viName})`);
        }
        console.log(`[browser] Click ${q + 1}/${item.qty} → strategy: ${added}`);
        await page.waitForTimeout(500);
      }

      // Clear search for next item
      await searchInput.fill('', { force: true });
      await page.waitForTimeout(400);
    }

    // ── Open cart / checkout ──
    console.log('[browser] Opening cart...');
    // Click the cart button (typically top-right, shows item count)
    const cartBtn = page.locator('[class*="cart"]:not(input), [class*="bag"], [class*="order-btn"]').first();
    await cartBtn.click();
    await page.waitForTimeout(1000);

    // ── Fill checkout form ──
    console.log('[browser] Filling checkout form...');

    // Name field
    const nameInput = page.locator('input[placeholder*="name" i], input[name*="name" i]').first();
    await nameInput.fill(`${customerName} - ${studentId}`);

    // Phone field (required by iPos — use student ID digits only or placeholder)
    const phoneDigits = studentId.replace(/\D/g, '').padEnd(10, '0').slice(0, 10);
    const phoneInput = page.locator('input[type="tel"], input[placeholder*="phone" i], input[placeholder*="số" i]').first();
    await phoneInput.fill(phoneDigits);

    // Pickup time — look for a time input or select
    if (pickupTime) {
      const timeInput = page.locator('input[type="time"], input[placeholder*="time" i], input[placeholder*="giờ" i]').first();
      const hasTime = await timeInput.count();
      if (hasTime > 0) await timeInput.fill(pickupTime);
    }

    // Note field — write full order details
    const note = `${customerName} - ${studentId} | ${cart.map((i) => `${i.name} x${i.qty}`).join(', ')}`;
    const noteInput = page.locator('textarea, input[placeholder*="note" i], input[placeholder*="ghi" i]').first();
    const hasNote = await noteInput.count();
    if (hasNote > 0) await noteInput.fill(note);

    // ── Submit ──
    console.log('[browser] Submitting order...');
    await page.screenshot({ path: '/tmp/before-submit.png' });

    const submitBtn = page.locator('button[type="submit"], button:has-text("Order"), button:has-text("Đặt"), button:has-text("Xác nhận")').first();
    await submitBtn.click();
    await page.waitForTimeout(3000);

    // ── Extract order code ──
    await page.screenshot({ path: '/tmp/after-submit.png' });
    const orderCode = await page.evaluate(() => {
      const el = document.querySelector('[class*="order-code"], [class*="foodbook"], [class*="code"]');
      return el?.textContent?.trim() || null;
    });

    console.log('[browser] Order placed! Code:', orderCode);
    return { orderCode: orderCode || 'CHECK_IPOS', success: true };

  } finally {
    await context.close();
    await browser.close();
  }
}

/* ─── Route ─── */
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
