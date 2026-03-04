/* ─── AI Service (OpenAI GPT-4o-mini) ─── */

import { OPENAI_API_KEY, OPENAI_MODEL, OPENAI_MAX_TOKENS, fmt } from './config';
import CATEGORIES from './menuData';

/**
 * Build the menu text for the AI system prompt
 */
function buildMenuText() {
  return CATEGORIES.map(
    (c) => `${c.name}: ${c.items.map((i) => `${i.name} (${fmt(i.price)})`).join(', ')}`
  ).join('\n');
}

/**
 * Build the system prompt for the AI assistant
 */
function buildSystemPrompt() {
  const menuText = buildMenuText();
  return `You're Joma Bot for Joma CIS Cafe (school cafeteria). Be VERY concise (1-2 sentences). Help students pick food.

MENU:
${menuText}

After answering, always remind them to type a category number (1-${CATEGORIES.length}) to browse, or just name what they want.`;
}

/**
 * Send a message to OpenAI and get a response
 * @param {string} userText - The user's message
 * @returns {Promise<string>} - The AI's response
 */
export async function askAI(userText) {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: OPENAI_MAX_TOKENS,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: userText },
        ],
      }),
    });

    const data = await res.json();
    return (
      data.choices?.[0]?.message?.content ||
      "Sorry, didn't catch that. Type a number (1-8) to browse the menu!"
    );
  } catch (err) {
    console.error('AI request failed:', err);
    return "Couldn't reach AI — just type a number (1-8) to browse the menu!";
  }
}
