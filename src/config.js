/* ─── App Configuration ─── */

// Claude API (Anthropic) — primary AI engine
export const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || '';
export const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

// OpenAI fallback (optional)
export const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';

// iPos live API
export const IPOS_API_URL =
  'https://weborder.ipos.vn/api/v1/menu?pos_parent=BRAND-3M93&pos_id=117850';

// iPos ordering page
export const IPOS_ORDER_URL =
  'https://order.ipos.vn/?pos_parent=BRAND-3M93';

/* ─── State Machine ─── */
export const STATES = {
  MAIN: 'MAIN',
  CAT: 'CAT',
  AFTER_ADD: 'AFTER_ADD',
  TIME: 'TIME',
  ID: 'ID',
  CONFIRM: 'CONFIRM',
  DONE: 'DONE',
};

/* ─── Currency Formatter ─── */
export const fmt = (n) => n.toLocaleString('vi-VN') + 'đ';
