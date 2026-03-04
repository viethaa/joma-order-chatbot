# Joma CIS Cafe — Order Chatbot 🍳☕

An AI-powered ordering chatbot for **Joma CIS Cafe** at Concordia International School, Hanoi.

![Dark terminal UI](https://img.shields.io/badge/UI-Dark_Terminal-1a1208?style=flat&labelColor=d4aa64)
![React](https://img.shields.io/badge/React-18-61dafb?style=flat&logo=react)
![OpenAI](https://img.shields.io/badge/AI-GPT--4o--mini-412991?style=flat&logo=openai)


## Project Structure

```
joma-order-chatbot/
├── index.html                 # Entry point
├── package.json               # Dependencies & scripts
├── vite.config.js             # Vite build config
├── src/
│   ├── main.jsx               # React DOM mount
│   ├── App.jsx                # Main chatbot component (state machine)
│   ├── config.js              # API keys, constants, state definitions
│   ├── menuData.js            # Menu categories & items with prices
│   ├── aiService.js           # OpenAI GPT-4o-mini integration
│   ├── components/
│   │   ├── FoodCard.jsx       # Food item image card
│   │   └── QuickBtn.jsx       # Quick action button
│   └── styles/
│       └── global.css         # All styles
└── README.md
```

## Getting Started

### Prerequisites
- Node.js 18+
- An OpenAI API key (already configured in `src/config.js`)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/joma-order-chatbot.git
cd joma-order-chatbot

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open `http://localhost:3000` in your browser.

### Build for Production

```bash
npm run build
```

Output goes to `dist/` — deploy to Netlify, Vercel, or any static host.

## Configuration

Edit `src/config.js` to update:

- **`OPENAI_API_KEY`** — Your OpenAI API key
- **`OPENAI_MODEL`** — Model to use (default: `gpt-4o-mini`)
- **`IPOS_URL`** — Link to the official Joma ordering page

## How It Works

The chatbot uses a **state machine** with these states:

| State | Description |
|-------|-------------|
| `MAIN` | Show categories, accept number or natural language |
| `CAT` | Show items in selected category |
| `AFTER_ADD` | Item added — add more, browse, or checkout |
| `TIME` | Enter pickup time |
| `ID` | Enter student ID |
| `CONFIRM` | Review and confirm order |
| `DONE` | Order placed, link to official site |

**Numbered inputs** are handled instantly (no API call). **Natural language** queries fall back to OpenAI GPT-4o-mini for smart responses.

## Menu Data

Menu items are sourced from Joma CIS Cafe. To update:

1. Edit `src/menuData.js`
2. Add/remove items, update prices
3. Optional: Add Wix CDN image URLs for food photos

## Tech Stack

- **React 18** — UI components with hooks
- **Vite** — Fast build tool
- **OpenAI API** — GPT-4o-mini for natural language understanding
- **CSS** — Custom dark theme with glassmorphism

## License

MIT
