// Vercel serverless function — places a real order on iPos for Joma CIS Cafe

import crypto from 'crypto';

const IPOS_API = 'https://weborder.ipos.vn/api/v1';
const POS_PARENT = 'BRAND-3M93';
const POS_ID = 117850;

async function getIposToken() {
  const deviceId = 'joma-chatbot-' + Math.random().toString(36).slice(2);
  const res = await fetch(`${IPOS_API}/user/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  });
  const data = await res.json();
  if (data.error !== 0) throw new Error('iPos auth failed');
  return data.data; // { uid, token }
}

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { items, pickupTime, studentName, studentId, note } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'No items provided' });

  // Parse pickup time — accepts "12:30", "1pm", "1:30pm", "13:30"
  let pickupHour = -1, pickupMinute = -1;
  if (pickupTime) {
    const t = pickupTime.trim().toLowerCase();
    const match12 = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    const match24 = t.match(/^(\d{1,2}):(\d{2})$/);
    if (match12) {
      let h = parseInt(match12[1]);
      const m = parseInt(match12[2] || '0');
      if (match12[3] === 'pm' && h !== 12) h += 12;
      if (match12[3] === 'am' && h === 12) h = 0;
      pickupHour = h; pickupMinute = m;
    } else if (match24) {
      pickupHour = parseInt(match24[1]);
      pickupMinute = parseInt(match24[2]);
    }
  }
  // Default to "now" if time not parseable
  if (pickupHour === -1) {
    const now = new Date();
    pickupHour = now.getHours();
    pickupMinute = now.getMinutes();
  }

  try {
    const { uid, token } = await getIposToken();

    const itemTotal = items.reduce((s, i) => s + i.price * i.qty, 0);

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
      Object.keys(calculation)
        .sort()
        .map((k) => calculation[k])
        .join('_') +
      '_' + uid + '_0';
    const signature = md5(sigStr);

    const orderItems = items.map((item, idx) => ({
      id: item.iposId,
      item_id: item.iposId,
      store_item_id: item.storeItemId,
      parent_id: item.storeItemId,
      quantity: item.qty,
      price: item.price,
      uid,
      fix: 0,
      foc: 0,
      Pr_Key: `joma${Date.now()}${idx}__${uid.slice(0, 8)}`,
    }));

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
        note: note || '',
        pickup_at: { hour: pickupHour, minute: pickupMinute, number_of_days: 0 },
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
        name: studentName || studentId || 'Student',
        phone: '0999999999',
        address: '',
        sub_address: '',
        lat: 0,
        long: 0,
        address_id: '',
      },
    };

    const iposRes = await fetch(`${IPOS_API}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-USER-TOKEN': token,
      },
      body: JSON.stringify(orderBody),
    });

    const iposData = await iposRes.json();

    if (!iposRes.ok || iposData.error !== 0) {
      return res.status(400).json({
        error: iposData.message || 'Order failed',
        detail: iposData,
      });
    }

    return res.status(200).json({
      success: true,
      orderCode: iposData.data.foodbook_code,
      status: iposData.data.status,
      pickupAt: iposData.data.date_pickup,
      totalAmount: iposData.data.total_amount,
    });
  } catch (err) {
    console.error('Order error:', err);
    return res.status(500).json({ error: err.message });
  }
}
