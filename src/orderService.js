/* ─── iPos Order Service — places real orders on Joma CIS Cafe iPos ─── */

import md5 from 'md5';

const TEST_MODE = import.meta.env.VITE_TEST_MODE === 'true';
const IPOS_API = 'https://weborder.ipos.vn/api/v1';
const POS_PARENT = 'BRAND-3M93';
const POS_ID = 117850;

/* ─── Parse pickup time string → { hour, minute } ─── */
export function parsePickupTime(timeStr) {
  const t = (timeStr || '').trim().toLowerCase();
  const m12 = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m12) {
    let h = parseInt(m12[1]);
    const m = parseInt(m12[2] || '0');
    if (m12[3] === 'pm' && h !== 12) h += 12;
    if (m12[3] === 'am' && h === 12) h = 0;
    return { hour: h, minute: m };
  }
  if (m24) return { hour: parseInt(m24[1]), minute: parseInt(m24[2]) };
  const now = new Date();
  return { hour: now.getHours(), minute: now.getMinutes() };
}

/* ─── Fetch live menu from iPos and build a lookup map ─── */
async function fetchLiveMenu() {
  try {
    const res = await fetch(`${IPOS_API}/menu?pos_parent=${POS_PARENT}&pos_id=${POS_ID}`);
    const data = await res.json();
    if (data.error !== 0 || !data.data?.items) return null;
    // Build map: storeItemId → live item
    const byStoreId = {};
    // Build map: normalised name → live item
    const byName = {};
    for (const item of data.data.items) {
      if (item.store_item_id) byStoreId[item.store_item_id] = item;
      if (item.name) byName[item.name.toLowerCase()] = item;
    }
    return { byStoreId, byName, raw: data.data.items };
  } catch {
    return null;
  }
}

/* ─── Resolve a cart item to the best live iPos ID ─── */
function resolveItem(cartItem, liveMenu) {
  if (!liveMenu) {
    console.warn(`[iPos] No live menu — using hardcoded ID for "${cartItem.name}":`, cartItem.iposId);
    return { item_id: cartItem.iposId, store_item_id: cartItem.storeItemId };
  }

  // 1. Match by storeItemId (most reliable)
  const byStore = liveMenu.byStoreId[cartItem.storeItemId];
  if (byStore) {
    console.log(`[iPos] "${cartItem.name}" → matched by storeItemId ${cartItem.storeItemId} → live id ${byStore.id} ("${byStore.name}")`);
    return { item_id: byStore.id, store_item_id: byStore.store_item_id };
  }

  // 2. Match by exact English name
  const byExact = liveMenu.byName[cartItem.name.toLowerCase()];
  if (byExact) {
    console.log(`[iPos] "${cartItem.name}" → matched by exact name → live id ${byExact.id} ("${byExact.name}")`);
    return { item_id: byExact.id, store_item_id: byExact.store_item_id };
  }

  // 3. Partial keyword match (live menu uses Vietnamese names)
  const keywords = cartItem.name.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  for (const kw of keywords) {
    const match = liveMenu.raw.find((i) => i.name?.toLowerCase().includes(kw));
    if (match) {
      console.log(`[iPos] "${cartItem.name}" → matched by keyword "${kw}" → live id ${match.id} ("${match.name}")`);
      return { item_id: match.id, store_item_id: match.store_item_id };
    }
  }

  // 4. Fall back to hardcoded IDs
  console.warn(`[iPos] "${cartItem.name}" → NO MATCH FOUND — falling back to hardcoded id ${cartItem.iposId}`);
  return { item_id: cartItem.iposId, store_item_id: cartItem.storeItemId };
}

/* ─── Place order on iPos ─── */
export async function placeOrder({ cart, pickupTime, studentName, note = '' }) {
  const orderNote = [
    note || studentName,
    cart.map((i) => `${i.name} x${i.qty}`).join(', '),
  ].filter(Boolean).join(' | ');

  if (TEST_MODE) {
    await new Promise((r) => setTimeout(r, 1200));
    return {
      orderCode: 'TEST-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
      status: 'WAIT_CONFIRM',
      totalAmount: cart.reduce((s, c) => s + c.price * c.qty, 0),
    };
  }

  // 1. Fetch live menu + get anonymous token in parallel
  const [liveMenu, tokenData] = await Promise.all([
    fetchLiveMenu(),
    fetch(`${IPOS_API}/user/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: 'joma-chatbot-' + Math.random().toString(36).slice(2) }),
    }).then((r) => r.json()),
  ]);

  if (tokenData.error !== 0) throw new Error('Could not connect to Joma ordering system');
  const { uid, token } = tokenData.data;

  // 2. Build calculation + signature
  const itemTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const calculation = {
    item_price: itemTotal,
    voucher_discount: 0,
    price_with_voucher: itemTotal,
    service_charge: 0,
    vat: 0,
    shipping_fee_type: 'FreeShip',
    shipping_fee: 0,
  };
  const sigStr =
    Object.keys(calculation).sort().map((k) => calculation[k]).join('_') +
    '_' + uid + '_0';
  const signature = md5(sigStr);

  // 3. Build order items — resolve each to the live iPos ID
  const { hour, minute } = parsePickupTime(pickupTime);
  const orderItems = cart.map((item, idx) => {
    const { item_id, store_item_id } = resolveItem(item, liveMenu);
    return {
      id: idx + 1,
      item_id,
      store_item_id,
      name: item.name,
      parent_id: null,
      quantity: item.qty,
      price: item.price,
      uid,
      fix: 0,
      foc: 0,
      Pr_Key: `joma${Date.now()}${idx}__${uid.slice(0, 8)}`,
    };
  });

  console.log('[iPos] Final order items:', orderItems.map((i) => ({
    name: i.name, item_id: i.item_id, store_item_id: i.store_item_id, qty: i.quantity,
  })));
  console.log('[iPos] Signature string:', sigStr);
  console.log('[iPos] Signature (MD5):', signature);

  // 4. Submit order
  const orderBody = {
    membership_id: '84999999999',
    membership_name: 'iPOS-O2O',
    membership_phone_number: '0999999999',
    brand_id: POS_PARENT,
    store_id: POS_ID,
    table_name: '',
    order_type: 'PICK',
    setting: {
      type: 'PICK',
      calculation,
      experience: '',
      source: 'DEFAULT',
      payment_method: 'PAYMENT_ON_DELIVERY',
      payment_type: 'OTHER',
      guss: [uid],
      voucher_code: '',
      note: orderNote,
      pickup_at: { hour, minute, number_of_days: 0 },
      shipping_fee_type: 'FreeShip',
      shipping_fee: 0,
      shipping_distance: 0,
      origin_amount: itemTotal,
      total_amount: itemTotal,
      vat: { multiple: 0, value: 0 },
      service_charge: { value: 0, multiple: 0 },
      signature,
      group_hash: '',
    },
    items: orderItems,
    user: {
      id: 0,
      name: studentName || 'Student',
      phone: '0999999999',
      address: '',
      sub_address: '',
      lat: 0,
      long: 0,
      address_id: '',
    },
  };

  const orderRes = await fetch(`${IPOS_API}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-USER-TOKEN': token },
    body: JSON.stringify(orderBody),
  });
  const orderData = await orderRes.json();

  if (!orderRes.ok || orderData.error !== 0) {
    console.error('[iPos] Order failed — status:', orderRes.status, '— response:', JSON.stringify(orderData));
    throw new Error(orderData.message || `Order submission failed (${orderRes.status})`);
  }

  return {
    orderCode: orderData.data.foodbook_code,
    status: orderData.data.status,
    totalAmount: orderData.data.total_amount,
  };
}
