import { useState, useRef, useEffect, useCallback } from 'react';
import { STATES as S, fmt } from './config';
import CATEGORIES from './menuData';
import { chat, resetHistory } from './aiService';
import { placeOrder, parsePickupTime } from './orderService';
import QuickBtn from './components/QuickBtn';

/* ─── Find a menu item by exact or fuzzy name ─── */
const ALL_ITEMS = CATEGORIES.flatMap((c) => c.items);

function findMenuItem(name) {
  const q = name.toLowerCase().trim();
  return (
    ALL_ITEMS.find((i) => i.name.toLowerCase() === q) ||
    ALL_ITEMS.find((i) => i.name.toLowerCase().includes(q)) ||
    ALL_ITEMS.find((i) => {
      const words = q.split(/\s+/).filter((w) => w.length > 3);
      return words.length > 0 && words.some((w) => i.name.toLowerCase().includes(w));
    }) ||
    null
  );
}

/* ─── Main App ─── */
export default function JomaChatBot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [state, setState] = useState(S.MAIN);
  const [currentCat, setCurrentCat] = useState(null);
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const initialized = useRef(false);

  const scrollDown = () =>
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);

  const addMsg = useCallback((role, content, extra = {}) => {
    setMessages((p) => [...p, { role, content, ...extra }]);
    scrollDown();
  }, []);

  const addBot = useCallback(
    (content, extra = {}) => addMsg('bot', content, extra),
    [addMsg]
  );
  const addUser = useCallback((text) => addMsg('user', text), [addMsg]);

  /* ─── Welcome ─── */
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setTimeout(() => {
      addBot(
        `Hey! Welcome to Joma CIS Cafe 👋\n\nTell me what you want — "2 thai milk teas and a croissant" works perfectly. Or tap a category below to browse.`
      );
    }, 300);
  }, [addBot]);

  /* ─── Cart helpers ─── */
  const cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const cartSummary = cart
    .map((c) => `  ${c.name} ×${c.qty} — ${fmt(c.price * c.qty)}`)
    .join('\n');
  const categoryList = CATEGORIES.map(
    (c, i) => `  [${i + 1}] ${c.icon} ${c.name}`
  ).join('\n');

  const addToCart = useCallback((item, qty = 1) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.name === item.name);
      if (existing)
        return prev.map((c) =>
          c.name === item.name ? { ...c, qty: c.qty + qty } : c
        );
      return [...prev, { ...item, qty }];
    });
  }, []);

  /* ─── AI handler — Claude with full conversation history ─── */
  const handleAI = async (userText) => {
    setLoading(true);

    const cartCtx = cart.length > 0
      ? cart.map((c) => `${c.name} ×${c.qty}`).join(', ')
      : '';

    const result = await chat(userText, cartCtx);

    if (result.type === 'checkout') {
      if (cart.length === 0) {
        addBot("Your cart's empty! What do you want to order?");
      } else {
        setState(S.NAME);
        addBot(`What's your name?`);
      }
      setLoading(false);
      return;
    }

    if (result.type === 'cart_action') {
      const added = [];
      const notFound = [];

      result.items.forEach(({ name, qty }) => {
        const item = findMenuItem(name);
        if (item) {
          addToCart(item, qty);
          added.push(`${item.name} ×${qty}`);
        } else {
          notFound.push(name);
        }
      });

      // Show Claude's own conversational text if it provided one,
      // otherwise generate a simple confirmation
      const aiText = result.text;
      const confirmLine = added.length
        ? `Added: ${added.join(', ')}.`
        : '';
      const notFoundLine = notFound.length
        ? `\n\nCouldn't find on menu: ${notFound.join(', ')}.`
        : '';

      addBot(aiText || `${confirmLine}${notFoundLine}`);
    } else {
      addBot(result.content);
    }

    setLoading(false);
    setState(S.MAIN);
  };

  /* ─── State machine ─── */
  const handleSend = (text) => {
    if (!text.trim() || loading) return;
    if (!isOpen) {
      addUser(text.trim());
      addBot("We're closed right now! Come back between 7am – 4pm (Vietnam time) ☕");
      return;
    }
    const t = text.trim();
    addUser(t);
    setInput('');
    const num = parseInt(t);

    switch (state) {
      /* ── MAIN — anything that's not a shortcut goes to Claude ── */
      case S.MAIN: {
        // Numbered category shortcuts
        if (num >= 1 && num <= CATEGORIES.length) {
          const cat = CATEGORIES[num - 1];
          setCurrentCat(num - 1);
          setState(S.CAT);
          addBot(
            `${cat.icon} ${cat.name}\n${'─'.repeat(30)}\n` +
            cat.items.map((item, i) => `  [${i + 1}] ${item.name} — ${fmt(item.price)}`).join('\n') +
            '\n\n[0] Go back'
          );
          return;
        }
        // Checkout keywords
        if (/^(done|checkout|order|pay|finish|confirm)/i.test(t)) {
          if (cart.length === 0) {
            addBot("Your cart's empty! What do you want to order?");
            return;
          }
          setState(S.NAME);
          addBot(`What's your name?`);
          return;
        }
        // Cart view
        if (/^(cart|view|my order|show)/i.test(t)) {
          if (cart.length === 0) {
            addBot("Cart's empty — what do you want?");
          } else {
            addBot(`CART\n${'─'.repeat(30)}\n${cartSummary}\n\nTotal: ${fmt(cartTotal)}\n\nType "done" to checkout.`);
          }
          return;
        }
        // Everything else → Claude
        handleAI(t);
        return;
      }

      /* ── CAT — numbered browsing ── */
      case S.CAT: {
        if (t === '0' || /^back$/i.test(t)) {
          setState(S.MAIN);
          addBot(`Categories:\n\n${categoryList}`);
          return;
        }
        const cat = CATEGORIES[currentCat];
        if (num >= 1 && num <= cat.items.length) {
          const item = cat.items[num - 1];
          addToCart(item);
          setState(S.AFTER_ADD);
          addBot(
            `Added: ${item.name} — ${fmt(item.price)}\nCart total: ${fmt(cartTotal + item.price)}\n\n  [1] More from ${cat.name}\n  [2] Other categories\n  [3] Checkout`
          );
          return;
        }
        // Natural language while in category menu also goes to Claude
        handleAI(t);
        return;
      }

      /* ── AFTER_ADD ── */
      case S.AFTER_ADD: {
        if (num === 1 || /more|same|another/i.test(t)) {
          const cat = CATEGORIES[currentCat];
          setState(S.CAT);
          addBot(
            `${cat.icon} ${cat.name}\n${'─'.repeat(30)}\n` +
            cat.items.map((item, i) => `  [${i + 1}] ${item.name} — ${fmt(item.price)}`).join('\n') +
            '\n\n[0] Go back'
          );
          return;
        }
        if (num === 2 || /browse|categor|back|menu/i.test(t)) {
          setState(S.MAIN);
          addBot(`Categories:\n\n${categoryList}`);
          return;
        }
        if (num === 3 || /check|done|order|pay|finish|confirm|go/i.test(t)) {
          setState(S.NAME);
          addBot(`What's your name?`);
          return;
        }
        handleAI(t);
        return;
      }

      /* ── NAME ── */
      case S.NAME: {
        setCustomerName(t);
        setState(S.TIME);
        addBot(`Hi ${t}! What time do you want to pick up? (e.g. "12:30" or "1pm")`);
        return;
      }

      /* ── TIME ── */
      case S.TIME: {
        const { hour, minute } = parsePickupTime(t);
        const now = new Date();
        const vnNowMinutes = ((now.getUTCHours() + 7) % 24) * 60 + now.getUTCMinutes();
        const pickedMinutes = hour * 60 + minute;
        if (pickedMinutes <= vnNowMinutes) {
          addBot(`That time has already passed. It's currently ${String(Math.floor(vnNowMinutes / 60)).padStart(2,'0')}:${String(vnNowMinutes % 60).padStart(2,'0')} — pick a later time.`);
          return;
        }
        setPickupTime(t);
        setState(S.ID);
        addBot(`What's your student ID?`);
        return;
      }

      /* ── ID ── */
      case S.ID: {
        setStudentId(t);
        setState(S.CONFIRM);
        addBot(
          `ORDER SUMMARY\n${'─'.repeat(30)}\n${cartSummary}\n\nTotal:    ${fmt(cartTotal)}\nPickup:   ${pickupTime}\nContact:  ${customerName} - ${t}\n${'─'.repeat(30)}\n\n  [1] Confirm\n  [2] Edit\n  [3] Cancel`
        );
        return;
      }

      /* ── CONFIRM ── */
      case S.CONFIRM: {
        if (num === 1 || /confirm|yes|ok|go|sure|yep/i.test(t)) {
          setState(S.DONE);
          setLoading(true);
          addBot('Placing your order on Joma iPos...');

          placeOrder({
            cart,
            pickupTime,
            studentName: `${customerName} - ${studentId}`,
            note: `${customerName} - ${studentId}`,
          })
            .then((result) => {
              addBot(
                `ORDER PLACED ✓\n${'─'.repeat(30)}\n${cartSummary}\n\nTotal:    ${fmt(cartTotal)}\nPickup:   ${pickupTime}\nContact:  ${customerName} - ${studentId}\nOrder #:  ${result.orderCode}\n${'─'.repeat(30)}\n\nYour order is confirmed! Show order #${result.orderCode} at the Joma counter at ${pickupTime}. 🙌`
              );
            })
            .catch((err) => {
              addBot(
                `Hmm, I couldn't place the order automatically (${err.message}).\n\nYour order:\n${cartSummary}\nTotal: ${fmt(cartTotal)}\nPickup: ${pickupTime}\n\nPlease order directly at the counter or try again.`
              );
            })
            .finally(() => setLoading(false));

          resetHistory();
          return;
        }
        if (num === 2 || /edit|change|back/i.test(t)) {
          setState(S.MAIN);
          addBot(`No problem. Here's your cart:\n${cartSummary}\n\nKeep adding or type "done" when ready.`);
          return;
        }
        if (num === 3 || /cancel|reset|clear/i.test(t)) {
          setCart([]);
          setCustomerName('');
          setPickupTime('');
          setStudentId('');
          setState(S.MAIN);
          resetHistory();
          addBot(`Order cancelled. Start fresh — what do you want?`);
          return;
        }
        addBot('[1] Confirm  [2] Edit  [3] Cancel');
        return;
      }

      /* ── DONE ── */
      case S.DONE: {
        setCart([]);
        setCustomerName('');
        setPickupTime('');
        setStudentId('');
        setState(S.MAIN);
        addBot(`Starting a new order! What can I get you?`);
        return;
      }

      default:
        setState(S.MAIN);
    }
  };

  const totalItems = cart.reduce((s, c) => s + c.qty, 0);

  /* ─── Open hours: 7am–4pm Vietnam time (UTC+7) ─── */
  const isOpen = (() => {
    const now = new Date();
    const vnHour = (now.getUTCHours() + 7) % 24;
    return vnHour >= 7 && vnHour < 16;
  })();

  /* ─── Render ─── */
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-icon">J</div>
            <div className="brand-text">
              <span className="brand-name">JOMA CIS CAFE</span>
              <span className="brand-sub">
                <span className={isOpen ? 'status-dot' : 'status-dot offline'} />
                {isOpen ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>

          <div className="header-right">
            {cart.length > 0 && (
              <div className="cart-pill">
                <span className="cart-count">
                  {totalItems} item{totalItems !== 1 ? 's' : ''}
                </span>
                <span className="cart-sep">·</span>
                <span className="cart-total">{fmt(cartTotal)}</span>
                <button
                  className="cart-checkout-btn"
                  onClick={() => handleSend('done')}
                >
                  Checkout →
                </button>
              </div>
            )}
            <a
              href="https://github.com/viethaa/joma-order-chatbot"
              target="_blank"
              rel="noopener noreferrer"
              className="github-btn"
            >
              <svg height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              viethaa/joma-order-chatbot
            </a>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`msg-row ${m.role}`}>
            {m.role === 'bot' ? (
              <div className="bot-wrap">
                <div className="bot-avatar">J</div>
                <div className="bot-content">
                  {m.content && (
                    <div className="msg-bubble bot">{m.content}</div>
                  )}
                  {m.link && (
                    <a
                      href={m.link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ipos-link"
                    >
                      {m.link.label}
                      <span className="link-arrow">↗</span>
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="msg-bubble user">{m.content}</div>
            )}
          </div>
        ))}

        {loading && (
          <div className="msg-row bot">
            <div className="bot-wrap">
              <div className="bot-avatar">J</div>
              <div className="loading-dots">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </main>

      {/* Footer */}
      <footer className="input-area">
        <div className="quick-row">
          {state === S.MAIN && cart.length === 0 &&
            CATEGORIES.map((c, i) => (
              <QuickBtn
                key={c.name}
                label={`${c.icon} ${c.name}`}
                onClick={() => handleSend(String(i + 1))}
              />
            ))}
          {state === S.MAIN && cart.length > 0 && (
            <>
              <QuickBtn label="Checkout" onClick={() => handleSend('done')} primary />
              <QuickBtn label="View Cart" onClick={() => handleSend('cart')} />
            </>
          )}
          {state === S.AFTER_ADD && (
            <>
              <QuickBtn label="Add more" onClick={() => handleSend('1')} />
              <QuickBtn label="Categories" onClick={() => handleSend('2')} />
              <QuickBtn label="Checkout" onClick={() => handleSend('3')} primary />
            </>
          )}
          {state === S.CONFIRM && (
            <>
              <QuickBtn label="✓ Confirm" onClick={() => handleSend('1')} primary />
              <QuickBtn label="Edit" onClick={() => handleSend('2')} />
              <QuickBtn label="Cancel" onClick={() => handleSend('3')} />
            </>
          )}
          {state === S.CAT && (
            <QuickBtn label="← Back" onClick={() => handleSend('0')} />
          )}
        </div>

        <div className="input-bar">
          <span className="prompt-symbol">&gt;</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
            placeholder={
              state === S.NAME
                ? 'Enter your name...'
                : state === S.TIME
                ? 'Enter pickup time...'
                : state === S.ID
                ? 'Enter student ID...'
                : state === S.CAT
                ? 'Item # or just say what you want...'
                : 'Tell me what you want...'
            }
            autoComplete="off"
          />
          <button
            className={`send-btn ${input.trim() ? 'active' : ''}`}
            onClick={() => handleSend(input)}
            disabled={!input.trim() || loading}
          >
            ↵
          </button>
        </div>
      </footer>
    </div>
  );
}
