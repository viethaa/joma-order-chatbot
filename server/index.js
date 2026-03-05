import express from 'express';
import { chromium } from 'playwright';

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
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

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
    await page.goto(IPOS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // ── Add each item ──
    for (const item of cartWithNames) {
      console.log(`[browser] Adding: ${item.name} (${item.viName}) x${item.qty}`);

      // Search for the item
      const searchInput = page.locator('input[placeholder]').first();
      await searchInput.fill(item.viName);
      await page.waitForTimeout(1000);

      // Click "+" qty times
      for (let q = 0; q < item.qty; q++) {
        // Find the item row containing the name, then click its add button
        const added = await page.evaluate((viName) => {
          // Walk all elements, find one whose text includes the item name
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            if (node.textContent.trim().includes(viName)) {
              // Walk up to find a parent container then look for a + button
              let el = node.parentElement;
              for (let i = 0; i < 6; i++) {
                if (!el) break;
                // Find a button that looks like "add" — has "+" or SVG icon
                const btns = el.querySelectorAll('button, [role="button"]');
                for (const btn of btns) {
                  const txt = btn.textContent.trim();
                  const cls = btn.className?.toString().toLowerCase() || '';
                  if (txt === '+' || cls.includes('add') || cls.includes('plus') || cls.includes('btn-add')) {
                    // Make sure it's not disabled / out of stock
                    if (!btn.disabled && !btn.closest('[class*="out-of-stock"]')) {
                      btn.click();
                      return true;
                    }
                  }
                }
                el = el.parentElement;
              }
            }
          }
          return false;
        }, item.viName);

        if (!added) {
          // Fallback: take a screenshot to debug
          await page.screenshot({ path: `/tmp/debug-${item.name}.png` });
          throw new Error(`Could not find add button for: ${item.name} (${item.viName})`);
        }
        await page.waitForTimeout(400);
      }

      // Clear search for next item
      await searchInput.fill('');
      await page.waitForTimeout(300);
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
