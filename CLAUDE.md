# Trading Journal — Project Instructions

## Project Overview
Personal trading journal web app. Instruments are free-text (not a fixed
list) — Gold, Silver, Nasdaq, and S&P 500 are just the default suggestions.
Stack: Vite + React, Tailwind CSS, Recharts, React Router, Firebase Auth.
Hosting: GitHub Pages (gh-pages branch, auto-deploy via GitHub Actions).
Backend (Phase 4): Azure Functions + Cosmos DB serverless.

## Design System
- Dark navy theme as default, light mode supported
- Mobile-first (works at 390px width minimum)
- Font: Inter for UI, JetBrains Mono for numbers/prices
- Accent color: blue (#2563eb light / #3b82f6 dark)
- Green for long/profit, red for short/loss

## File Structure
```
trading-journal/
├── .github/workflows/deploy.yml   # GitHub Actions auto-deploy
├── src/
│   ├── firebase.js                # Firebase init + auth export
│   ├── context/AuthContext.jsx    # useAuth hook + AuthProvider
│   ├── hooks/useStorage.js        # localStorage data layer (Phase 1-3)
│   ├── hooks/useApi.js            # Azure Functions data layer (Phase 4)
│   ├── components/
│   │   ├── NavBar.jsx
│   │   ├── PrivateRoute.jsx
│   │   └── TradeDrawer.jsx        # slide-in form for new/edit trade
│   ├── pages/
│   │   ├── Landing.jsx
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Trades.jsx
│   │   ├── Ideas.jsx
│   │   └── Notes.jsx
│   ├── App.jsx                    # Router + AuthProvider wrapper
│   └── index.css                  # Tailwind import + @theme tokens
└── vite.config.js                 # includes @tailwindcss/vite plugin
```

## Data Schemas

### Trade
```js
{
  id: string,           // crypto.randomUUID()
  userId: string,       // Firebase uid
  instrument: string,   // free text, not a fixed enum
  direction: 'long' | 'short',
  entryDate: string,    // ISO date
  entryPrice: number,
  shares: number,       // always starts at 100
  status: 'open' | 'partial' | 'closed',
  partialSells: [{ date, shares, price }],
  exitDate: string | null,
  exitPrice: number | null,
  pnl: number | null,
  notes: string,
  tags: string[]
}
```

### Idea
```js
{
  id: string,
  userId: string,
  instrument: string,
  setup: string,
  timeframe: string,
  confidence: 1 | 2 | 3 | 4 | 5,
  createdAt: string,
  status: 'watching' | 'active' | 'expired'
}
```

### Note
```js
{
  id: string,
  userId: string,
  title: string,        // first line of content or 'Untitled'
  content: string,
  createdAt: string,
  updatedAt: string
}
```

## Trading Strategy Context
- Entry: 100 shares at start of new trend (CCI crosses +100 or -100)
- Partial sell: 30-40 shares when trend loses momentum (CCI weakening)
- Re-entry: 100 shares at start of next wave
- Indicators: CCI (14), EMA 20/50, Parabolic SAR, Heikin Ashi candles

## Phase 1 — Scaffold & Deploy
1. Run in terminal (outside Claude Code):
   ```
   npm create vite@latest trading-journal -- --template react
   cd trading-journal
   npm install
   npm install tailwindcss @tailwindcss/vite
   npm install recharts react-router-dom firebase
   ```
   Always install the latest major version of `tailwindcss` (currently v4)
   and every other dependency — do not pin to older majors unless a
   specific package breaks and needs a temporary downgrade.
2. Add the `@tailwindcss/vite` plugin to `vite.config.js` (`plugins: [react(), tailwindcss()]`).
   No `tailwind.config.js` or `postcss.config.js` needed for v4.
3. Replace src/index.css with `@import "tailwindcss";` + an `@theme` block for
   design tokens (colors, fonts) + the CSS token `:root` block for dark/light values.
4. Create .github/workflows/deploy.yml (see prompt below)
5. Update vite.config.js base to '/YOUR_REPO_NAME/'

### Prompt: GitHub Actions deploy
Create .github/workflows/deploy.yml that triggers on push to main, uses
actions/checkout@v4, actions/setup-node@v4 (node 20), runs npm ci && npm run build,
then peaceiris/actions-gh-pages@v3 to push dist/ to gh-pages branch.

## Phase 2 — Auth
1. Create Firebase project at console.firebase.google.com
2. Enable Email/Password authentication
3. Copy firebaseConfig from Project Settings → Your apps

### Prompt: Firebase + Auth context
Create src/firebase.js initializing Firebase with the provided config, exporting auth.
Create src/context/AuthContext.jsx with AuthProvider and useAuth hook exposing:
user, loading, login(email,password), register(email,password), logout.
Uses onAuthStateChanged to track session.

### Prompt: Router + pages
Set up React Router in App.jsx with routes: / (Landing), /login, /register,
/dashboard (private), /trades (private), /ideas (private), /notes (private).
PrivateRoute checks useAuth().user, redirects to /login if null.
NavBar shows different links for logged-in vs logged-out state.

### Prompt: Login + Register pages
Centered card layout, email + password inputs, loading state, Firebase error
message mapping, link between login/register, redirect to /dashboard on success.

## Phase 3 — Core Features (all data in localStorage)

### Prompt: useStorage hook
src/hooks/useStorage.js — wraps localStorage with per-user keys (prefix with Firebase uid).
Expose: getTrades, saveTrade, deleteTrade, getIdeas, saveIdea, deleteIdea,
getNotes, saveNote. IDs via crypto.randomUUID().

### Prompt: Trades page (/trades)
Table with columns: instrument, direction (green/red badge), entry date, entry price,
shares, status badge, P&L (colored), actions. Filters: status tabs, instrument dropdown,
search. "New Trade" button → slide-in drawer form. "Record Partial Sell" action on open trades.

### Prompt: Dashboard (/dashboard)
Recharts charts using ResponsiveContainer:
- Stat row: Total P&L, Win Rate, Open Positions, Best Trade
- Equity curve LineChart (cumulative P&L over time)
- P&L by instrument BarChart
- Monthly performance BarChart (green/red bars)
- Win/loss PieChart

### Prompt: Ideas board (/ideas)
Card grid (3 col desktop / 1 col mobile). Each card: instrument, setup, timeframe,
confidence stars, date, status badge. Actions: promote to trade, mark expired, delete.
"New Idea" drawer. Sort by confidence desc.

### Prompt: Notes page (/notes)
Left sidebar list + right editor panel. Textarea with large font, auto-save after
1s debounce. Title = first line. New/delete with confirmation.

## Phase 4 — Azure Backend (replace localStorage)
1. Create Cosmos DB account (serverless) at portal.azure.com
2. Database: trading-journal, containers: trades/ideas/notes (partition key: /userId)
3. Copy Primary Connection String from Keys
4. Create Function App (Node.js 20, Consumption plan)
5. Add CORS for GitHub Pages URL + localhost:5173

### Prompt: Azure Functions API
Create api/ folder with Azure Functions v4 Node.js project.
HTTP triggers for CRUD on /api/trades, /api/ideas, /api/notes.
Uses @azure/cosmos SDK, connection string from env COSMOS_CONNECTION_STRING.
Partition key = userId (Firebase uid).
Include local.settings.json with placeholder, and README for local dev + deploy.

### Prompt: Swap to API hook
Create src/hooks/useApi.js with same interface as useStorage but calls Azure Functions.
Base URL from env VITE_API_URL. Auth via Firebase getIdToken() as Bearer token.
Include loading + error states. No page components should need to change.

## Notes for Claude Code
- Always use Tailwind utility classes, not inline styles
- Use latest major versions of all dependencies (Tailwind v4+, etc.) — don't
  pin to older majors unless something specifically breaks
- Use React functional components with hooks only (no class components)
- All forms should have proper loading and error states
- Mobile-first: test at 390px width
- Dark theme is default; respect prefers-color-scheme for light
- Use named exports for components, default export for pages
