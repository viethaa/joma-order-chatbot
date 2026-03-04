import { useState, useRef, useEffect, useCallback } from 'react';
import { STATES as S, fmt, IPOS_URL } from './config';
import CATEGORIES from './menuData';
import { askAI } from './aiService';
import FoodCard from './components/FoodCard';
import QuickBtn from './components/QuickBtn';

/* ─── Main Chatbot App ─── */
export default function JomaChatBot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [state, setState] = useState(S.MAIN);
  const [currentCat, setCurrentCat] = useState(null);
  const [cart, setCart] = useState([]);
  const [pickupTime, setPickupTime] = useState('');
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const initialized = useRef(false);

  const scrollDown = () =>
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

  const addBot = useCallback((content, extra = {}) => {
    setMessages((p) => [...p, { role: 'bot', content, ...extra }]);
    scrollDown();
  }, []);

  const addUser = useCallback((text) => {
    setMessages((p) => [...p, { role: 'user', content: text }]);
    scrollDown();
  }, []);

  /* ─── Welcome Message ─── */
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setTimeout(() => {
      addBot(
        `👋 Welcome to Joma CIS Cafe!\nLet's get your order started.\n\nPick a category:\n\n${CATEGORIES.map((c, i) => `  ${i + 1}. ${c.icon} ${c.name}`).join('\n')}\n\nType a number, or just tell me what you want!`
      );
    }, 300);
  }, [addBot]);

  /* ─── Cart Helpers ─── */
  const cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const cartSummary = cart
    .map((c) => `  • ${c.name} ×${c.qty} — ${fmt(c.price * c.qty)}`)
    .join('\n');

  const categoryList = CATEGORIES.map(
    (c, i) => `  ${i + 1}. ${c.icon} ${c.name}`
  ).join('\n');

  /* ─── AI Fallback ─── */
  const handleAI = async (userText) => {
    setLoading(true);
    const reply = await askAI(userText);
    addBot(reply);
    setLoading(false);
    setState(S.MAIN);
  };

  /* ─── Input Handler (State Machine) ─── */
  const handleSend = (text) => {
    if (!text.trim() || loading) return;
    const t = text.trim();
    addUser(t);
    setInput('');

    const num = parseInt(t);

    switch (state) {
      /* ── MAIN: Category selection ── */
      case S.MAIN: {
        if (num >= 1 && num <= CATEGORIES.length) {
          const cat = CATEGORIES[num - 1];
          setCurrentCat(num - 1);
          setState(S.CAT);
          const list = cat.items
            .map((item, i) => `  ${i + 1}. ${item.name} — ${fmt(item.price)}`)
            .join('\n');
          addBot(
            `${cat.icon} ${cat.name}:\n\n${list}\n\nType an item number to add it. Or type 0 to go back.`
          );
          cat.items.forEach((item) => {
            if (item.img) {
              setMessages((p) => [...p, { role: 'bot', content: '', foodCard: item }]);
            }
          });
          scrollDown();
          return;
        }
        if (/^(done|checkout|order|pay|finish|confirm)/i.test(t)) {
          if (cart.length === 0) {
            addBot('Your cart is empty! Pick a category first:\n\n' + categoryList);
            return;
          }
          setState(S.TIME);
          addBot(
            `🛒 Your cart:\n${cartSummary}\n\n💰 Total: ${fmt(cartTotal)}\n\n⏰ What time do you want to pick up?\n(e.g. "12:30" or "1pm")`
          );
          return;
        }
        if (/^(cart|view|my order|show)/i.test(t)) {
          if (cart.length === 0) {
            addBot('Cart is empty! Type a number (1-8) to browse.');
          } else {
            addBot(
              `🛒 Your cart:\n${cartSummary}\n\n💰 Total: ${fmt(cartTotal)}\n\nType "done" to checkout, or keep browsing!`
            );
          }
          return;
        }
        handleAI(t);
        return;
      }

      /* ── CAT: Item selection within a category ── */
      case S.CAT: {
        if (t === '0' || /back/i.test(t)) {
          setState(S.MAIN);
          addBot(`Pick a category:\n\n${categoryList}`);
          return;
        }
        const cat = CATEGORIES[currentCat];
        if (num >= 1 && num <= cat.items.length) {
          const item = cat.items[num - 1];
          const existing = cart.find((c) => c.name === item.name);
          if (existing) {
            setCart((p) =>
              p.map((c) => (c.name === item.name ? { ...c, qty: c.qty + 1 } : c))
            );
          } else {
            setCart((p) => [...p, { ...item, qty: 1 }]);
          }
          setState(S.AFTER_ADD);
          const newTotal = cartTotal + item.price;
          addBot(
            `✅ Added: ${item.name} (${fmt(item.price)})\n\nCart total: ${fmt(newTotal)}\n\n  1. Add more from ${cat.name}\n  2. Browse other categories\n  3. Checkout →`
          );
          return;
        }
        handleAI(t);
        return;
      }

      /* ── AFTER_ADD: Post-add options ── */
      case S.AFTER_ADD: {
        if (num === 1 || /more|same|another/i.test(t)) {
          const cat = CATEGORIES[currentCat];
          setState(S.CAT);
          const list = cat.items
            .map((item, i) => `  ${i + 1}. ${item.name} — ${fmt(item.price)}`)
            .join('\n');
          addBot(
            `${cat.icon} ${cat.name}:\n\n${list}\n\nType an item number. Or 0 to go back.`
          );
          return;
        }
        if (num === 2 || /browse|categor|back|menu/i.test(t)) {
          setState(S.MAIN);
          addBot(`Pick a category:\n\n${categoryList}`);
          return;
        }
        if (num === 3 || /check|done|order|pay|finish|confirm|go/i.test(t)) {
          setState(S.TIME);
          addBot(
            `🛒 Your cart:\n${cartSummary}\n\n💰 Total: ${fmt(cartTotal)}\n\n⏰ What time do you want to pick up?`
          );
          return;
        }
        handleAI(t);
        return;
      }

      /* ── TIME: Pickup time entry ── */
      case S.TIME: {
        setPickupTime(t);
        setState(S.ID);
        addBot(`⏰ Pickup time: ${t}\n\n🪪 What's your Student ID?`);
        return;
      }

      /* ── ID: Student ID entry ── */
      case S.ID: {
        setStudentId(t);
        setState(S.CONFIRM);
        addBot(
          `📋 Order Summary:\n\n${cartSummary}\n\n💰 Total: ${fmt(cartTotal)}\n⏰ Pickup: ${pickupTime}\n🪪 Student ID: ${t}\n\n  1. ✅ Confirm order\n  2. ✏️ Edit order\n  3. ❌ Cancel`
        );
        return;
      }

      /* ── CONFIRM: Final confirmation ── */
      case S.CONFIRM: {
        if (num === 1 || /confirm|yes|ok|go|sure|yep/i.test(t)) {
          setState(S.DONE);
          addBot(
            `🎉 Order placed!\n\n${cartSummary}\n\n💰 Total: ${fmt(cartTotal)}\n⏰ Pickup: ${pickupTime}\n🪪 Student: ${studentId}\n\nHead to the Joma counter at ${pickupTime}!\n\n👇 Click below to also place on the official site.`
          );
          setMessages((p) => [
            ...p,
            {
              role: 'bot',
              content: '',
              link: { url: IPOS_URL, label: 'Open Joma iPos Official Site →' },
            },
          ]);
          scrollDown();
          return;
        }
        if (num === 2 || /edit|change|back/i.test(t)) {
          setState(S.MAIN);
          addBot(
            `No problem! Here's your cart:\n${cartSummary}\n\nPick a category to add more:\n\n${categoryList}\n\nOr type "done" when ready.`
          );
          return;
        }
        if (num === 3 || /cancel|reset|clear/i.test(t)) {
          setCart([]);
          setPickupTime('');
          setStudentId('');
          setState(S.MAIN);
          addBot(
            `Order cancelled. Let's start fresh!\n\nPick a category:\n\n${categoryList}`
          );
          return;
        }
        addBot('Type 1 to confirm, 2 to edit, or 3 to cancel.');
        return;
      }

      /* ── DONE: Start new order ── */
      case S.DONE: {
        setCart([]);
        setPickupTime('');
        setStudentId('');
        setState(S.MAIN);
        addBot(`Starting a new order!\n\nPick a category:\n\n${categoryList}`);
        return;
      }

      default:
        setState(S.MAIN);
        addBot('Type a number (1-8) to browse the menu!');
    }
  };

  /* ─── Render ─── */
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-top">
          <div className="brand">
            <div className="brand-icon">J</div>
            <div>
              <div className="brand-name">Joma CIS Bot</div>
              <div className="brand-status">
                <span className="status-dot" />
                ONLINE — ORDER ASSISTANT
              </div>
            </div>
          </div>
        </div>

        {cart.length > 0 && (
          <div className="cart-strip">
            <span className="cart-strip-count">
              🛒 {cart.reduce((s, c) => s + c.qty, 0)} item
              {cart.reduce((s, c) => s + c.qty, 0) > 1 ? 's' : ''}
            </span>
            <span className="cart-strip-total">{fmt(cartTotal)}</span>
            <button className="cart-strip-btn" onClick={() => handleSend('done')}>
              Checkout →
            </button>
          </div>
        )}
      </header>

      {/* Messages */}
      <main className="messages">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`msg-row ${m.role === 'user' ? 'user' : 'bot'}`}
          >
            {m.role === 'bot' ? (
              <div className="msg-bot-wrap">
                {m.foodCard && <FoodCard item={m.foodCard} />}
                {m.link && (
                  <a
                    href={m.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="msg-link"
                  >
                    {m.link.label}
                  </a>
                )}
                {m.content && (
                  <div className="msg-bubble bot">{m.content}</div>
                )}
              </div>
            ) : (
              <div className="msg-bubble user">{m.content}</div>
            )}
          </div>
        ))}

        {loading && (
          <div className="msg-row bot">
            <div className="loading-dots">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </main>

      {/* Input Area */}
      <footer className="input-area">
        <div className="quick-buttons">
          {state === S.MAIN && cart.length === 0 &&
            CATEGORIES.slice(0, 4).map((c, i) => (
              <QuickBtn
                key={c.name}
                label={`${i + 1}. ${c.icon} ${c.name}`}
                onClick={() => handleSend(String(i + 1))}
              />
            ))}
          {state === S.MAIN && cart.length > 0 && (
            <>
              <QuickBtn label="🛒 Checkout" onClick={() => handleSend('done')} />
              <QuickBtn label="📋 View Cart" onClick={() => handleSend('cart')} />
            </>
          )}
          {state === S.AFTER_ADD && (
            <>
              <QuickBtn label="1. Add more" onClick={() => handleSend('1')} />
              <QuickBtn label="2. Other category" onClick={() => handleSend('2')} />
              <QuickBtn label="3. Checkout →" onClick={() => handleSend('3')} />
            </>
          )}
          {state === S.CONFIRM && (
            <>
              <QuickBtn label="1. ✅ Confirm" onClick={() => handleSend('1')} />
              <QuickBtn label="2. ✏️ Edit" onClick={() => handleSend('2')} />
              <QuickBtn label="3. ❌ Cancel" onClick={() => handleSend('3')} />
            </>
          )}
          {state === S.CAT && (
            <QuickBtn label="0. ← Back" onClick={() => handleSend('0')} />
          )}
        </div>

        <div className="input-bar">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
            placeholder={
              state === S.TIME
                ? 'Enter pickup time...'
                : state === S.ID
                ? 'Enter student ID...'
                : state === S.CAT
                ? 'Item number or 0 to go back...'
                : 'Type a number or ask me anything...'
            }
          />
          <button
            className={`send-btn ${input.trim() ? 'active' : ''}`}
            onClick={() => handleSend(input)}
            disabled={!input.trim() || loading}
          >
            →
          </button>
        </div>
      </footer>
    </div>
  );
}
