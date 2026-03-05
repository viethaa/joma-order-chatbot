/* ─── AI Service — uses OpenAI GPT-4o-mini ─── */

import CATEGORIES from './menuData';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

/* ─── Persistent conversation history ─── */
let history = [];

/* ─── Menu string for system prompt ─── */
function buildMenu() {
  return CATEGORIES.map(
    (cat) =>
      `${cat.name}: ` +
      cat.items.map((i) => `${i.name} (${i.price.toLocaleString('vi-VN')}đ)`).join(', ')
  ).join('\n');
}

function getSystemPrompt(cartContext) {
  return `You are Joma, the friendly barista at Joma CIS Cafe — a cozy Western-style cafe inside CIS school in Hanoi, Vietnam. You talk like a real, chill cafe employee — warm, casual, a little fun. Keep replies short (2-4 sentences max).

MENU:
${buildMenu()}

CART RIGHT NOW:
${cartContext || '(empty)'}

RULES:
- If the customer orders something, use the add_to_cart function with the EXACT item name from the menu and the quantity.
- If something isn't on the menu (e.g. steak, pizza, burger), don't add it — tell them you don't have it, and suggest something similar if possible.
- If the customer is vague (e.g. "a coffee"), ask which one or pick the most popular default and say what you picked.
- If they say "make it two" or "actually three", figure out what they meant from context.
- Never make up prices or items. Only use what's on the menu.
- Be natural — you're a barista, not a robot.
- If the customer indicates they're done ordering and want to checkout / pay / finish (e.g. "that's all", "done", "checkout", "let's pay", "no let's checkout"), call start_checkout — do NOT handle payment or IDs yourself.`;
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'add_to_cart',
      description: "Add items to the customer's cart. Call this whenever the customer orders food or drinks.",
      parameters: {
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
  },
  {
    type: 'function',
    function: {
      name: 'start_checkout',
      description: "Call this when the customer is done ordering and wants to checkout / pay / finish their order.",
      parameters: { type: 'object', properties: {} },
    },
  },
];

async function callAPI(cartContext) {
  if (!OPENAI_API_KEY) throw new Error('NO_KEY');

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      messages: [
        { role: 'system', content: getSystemPrompt(cartContext) },
        ...history,
      ],
      tools,
      tool_choice: 'auto',
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  return res.json();
}

/* ─── Main chat function ─── */
export async function chat(userText, cartContext = '') {
  history.push({ role: 'user', content: userText });

  try {
    const data = await callAPI(cartContext);
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error('Empty response from AI');

    history.push(message);

    const toolCall = message.tool_calls?.[0];

    if (toolCall?.function?.name === 'start_checkout') {
      return { type: 'checkout' };
    }

    if (toolCall?.function?.name === 'add_to_cart') {
      const args = JSON.parse(toolCall.function.arguments);

      // Acknowledge the tool call in history
      history.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: 'Cart updated.',
      });

      // Get the follow-up text response
      const followUp = await callAPI(cartContext);
      const followMsg = followUp.choices?.[0]?.message;
      if (followMsg) history.push(followMsg);
      const aiText = followMsg?.content || null;

      return {
        type: 'cart_action',
        items: args.items,
        text: aiText,
      };
    }

    return {
      type: 'text',
      content: message.content || "Sorry, didn't catch that!",
    };
  } catch (err) {
    history.pop();
    if (err.message === 'NO_KEY') {
      return {
        type: 'text',
        content: 'No API key found!\n\nCreate a .env file in the project root:\n\nVITE_OPENAI_API_KEY=your-key-here\n\nThen restart the dev server.',
      };
    }
    console.error('AI error:', err);
    return { type: 'text', content: `AI error: ${err.message}` };
  }
}

/* ─── Reset conversation ─── */
export function resetHistory() {
  history = [];
}
