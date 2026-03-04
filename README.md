# Joma CIS Cafe — Order Chatbot

Agentic AI order assistant for Joma CIS Cafe at Concordia International School, Hanoi. Chat naturally to order and the agent automatically places your pickup order on the live iPos system.

![React](https://img.shields.io/badge/React-18-61dafb?style=flat&logo=react)
![OpenAI](https://img.shields.io/badge/GPT--4o--mini-412991?style=flat&logo=openai)
![Vercel](https://img.shields.io/badge/Vercel-ready-000000?style=flat&logo=vercel)

---

## What it does

- Chat naturally — "2 thai milk teas and a croissant" just works
- AI understands context, handles vague requests, and declines items not on the menu
- On checkout, the agent places a real pickup order on the Joma iPos system
- You get an order code — pay cash at the counter when you pick up

## Tech Stack

- **React 18 + Vite**
- **GPT-4o-mini** with tool calling for natural language → cart actions
- **iPos API** — reverse-engineered order submission with MD5 signature auth
- **Vercel** — serverless functions for API proxying in production

## Project Structure

```
├── api/
│   ├── chat.js          # Vercel serverless — proxies OpenAI API
│   └── order.js         # Vercel serverless — proxies iPos order submission
├── src/
│   ├── App.jsx          # Main app — state machine + AI handler
│   ├── aiService.js     # GPT-4o-mini with tool use (add_to_cart)
│   ├── orderService.js  # iPos order placement (token auth, MD5 signature)
│   ├── menuData.js      # Menu items with iPos IDs mapped for ordering
│   ├── config.js        # Constants, state definitions, formatter
│   └── styles/
│       └── global.css   # Dark terminal/gold theme
```

## Getting Started

### Prerequisites
- Node.js 18+
- OpenAI API key

### Setup

```bash
git clone https://github.com/viethaa/joma-order-chatbot.git
cd joma-order-chatbot
npm install
```

Create a `.env` file in the root:

```
VITE_OPENAI_API_KEY=your-openai-key-here
VITE_TEST_MODE=false
```

```bash
npm run dev
```

Open `http://localhost:3000`.

### Test Mode

Set `VITE_TEST_MODE=true` in `.env` to run through the full ordering flow without placing a real order. You will get a fake order code instead.

### Production (Vercel)

```bash
npm run build
```

Deploy to Vercel and set `OPENAI_API_KEY` as an environment variable in the Vercel dashboard. The serverless functions in `api/` handle all API calls server-side.

## How It Works

The app uses a state machine for the checkout flow and routes all natural language to GPT-4o-mini via tool calling.

| State | Description |
|-------|-------------|
| `MAIN` | Free chat — orders, questions, browsing |
| `CAT` | Numbered category browsing |
| `TIME` | Enter pickup time |
| `ID` | Enter name / student ID |
| `CONFIRM` | Review order summary |
| `DONE` | Order placed on iPos |

When the user confirms, `orderService.js` gets an anonymous iPos token, computes an MD5 signature over the order total, and submits the order directly to the iPos API. The order appears on the cafe's POS with `WAIT_CONFIRM` status.
