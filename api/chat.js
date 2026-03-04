// Vercel serverless function — proxies Claude API so the key never reaches the browser

import CATEGORIES from '../src/menuData.js';

const fmt = (n) => n.toLocaleString('vi-VN') + 'đ';

function buildMenu() {
  return CATEGORIES.map(
    (cat) =>
      `${cat.name}: ` +
      cat.items.map((i) => `${i.name} (${fmt(i.price)})`).join(', ')
  ).join('\n');
}

function getSystem(cartContext) {
  return `You are Joma, the friendly barista at Joma CIS Cafe — a cozy Western-style cafe inside CIS school in Hanoi, Vietnam. You talk like a real, chill cafe employee — warm, casual, a little fun. Keep replies short (2-4 sentences max).

MENU:
${buildMenu()}

CART RIGHT NOW:
${cartContext || '(empty)'}

RULES:
- If the customer orders something, use the add_to_cart tool with the EXACT item name from the menu and the quantity. Do this for every item they mention in one call.
- If something isn't on the menu (e.g. steak, pizza, burger), don't add it — tell them you don't have it, and suggest something similar if possible.
- If the customer is vague (e.g. "a coffee"), ask which one or pick the most popular default and say what you picked.
- If they say "make it two" or "actually three", figure out what they meant from context.
- Never make up prices or items. Only use what's on the menu.
- Be natural — you're a barista, not a robot.`;
}

const tools = [
  {
    name: 'add_to_cart',
    description: "Add items to the customer's cart. Call this whenever the customer orders food or drinks.",
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Exact item name from the menu' },
              qty:  { type: 'integer', description: 'Quantity', minimum: 1 },
            },
            required: ['name', 'qty'],
          },
        },
      },
      required: ['items'],
    },
  },
];

export default async function handler(req, res) {
  // CORS — allow the frontend origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on server' });

  const { messages, cartContext } = req.body;
  if (!messages) return res.status(400).json({ error: 'Missing messages' });

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: getSystem(cartContext || ''),
        messages,
        tools,
      }),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error('Anthropic proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
}
