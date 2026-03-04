/* ─── API Configuration ─── */

// OpenAI API key for AI chat fallback
// NOTE: In production, move this to an environment variable or backend
export const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';

export const OPENAI_MODEL = 'gpt-4o-mini';
export const OPENAI_MAX_TOKENS = 200;

// iPos ordering page (official Joma CIS Cafe)
export const IPOS_URL =
  'https://order.ipos.vn/menu?pos_parent=BRAND-3M93&pos_id=117850&source=DEFAULT';

/* ─── State Machine States ─── */
export const STATES = {
  MAIN: 'MAIN',
  CAT: 'CAT',
  AFTER_ADD: 'AFTER_ADD',
  TIME: 'TIME',
  ID: 'ID',
  CONFIRM: 'CONFIRM',
  DONE: 'DONE',
  AI: 'AI',
};

/* ─── Currency Formatter ─── */
export const fmt = (n) => n.toLocaleString('vi-VN') + 'đ';
