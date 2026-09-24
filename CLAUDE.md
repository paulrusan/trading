# Trading Journal — Project Instructions

## Project Overview
Personal trading journal + charting web app. Instruments are free-text
everywhere (not a fixed list) — any symbol can be journaled or charted;
Gold/Silver/Nasdaq/S&P 500 are just default suggestions in a couple of UIs.
Stack: Vite + React, Tailwind CSS, Recharts (journal charts), TradingView's
public embeddable widget + `lightweight-charts` (market charting), React
Router, Firebase Auth.
Hosting: GitHub Pages (gh-pages branch, auto-deploy via GitHub Actions).
Backend: Azure Functions (Flex Consumption) + Cosmos DB, deployed via OIDC.
Market data: Twelve Data API or Yahoo Finance (`yahoo-finance2`),
user-selectable per chart, proxied through our own Function App so the
Twelve Data API key never reaches the browser (Yahoo needs no key).
AI: Anthropic API, bring-your-own-key per user (see "AI Assistant" below).

## Design System
- Dark navy theme as default, light mode supported
- Mobile-first (works at 390px width minimum)
- Font: Inter for UI, JetBrains Mono for numbers/prices
- Accent color: blue (#2563eb light / #3b82f6 dark)
- Green for long/profit, red for short/loss

## File Structure
```
trading-journal/
├── .github/workflows/
│   ├── deploy.yml                     # frontend → GitHub Pages
│   └── main_paultrading.yml           # api/** → Azure Functions (OIDC)
├── api/                                # Azure Functions v4, Node.js, Flex Consumption
│   ├── src/
│   │   ├── cosmosClient.js            # lazy-init Cosmos client (see gotcha below)
│   │   ├── verifyAuth.js              # lazy-init Firebase Admin, verifies Bearer token
│   │   ├── crudRoutes.js              # generic CRUD factory for trades/ideas/notes/alerts
│   │   ├── marketDataFetchers.js      # fetchFromTwelveData/fetchFromYahoo, shared by
│   │   │                              #   marketData.js (on-demand) and alertsEngine.js (hourly)
│   │   ├── evaluateAlert.js           # edge-triggered condition evaluation for alerts
│   │   ├── sendEmail.js               # Gmail SMTP via nodemailer
│   │   ├── lib/indicators.js          # server-side port of src/lib/indicators.js
│   │   └── functions/
│   │       ├── trades.js, ideas.js, notes.js, alerts.js   # registerCrudRoutes(...)
│   │       ├── settings.js            # per-user settings (Anthropic key)
│   │       ├── assistant.js           # POST /api/assistant — Claude, server-side key
│   │       ├── marketData.js          # GET /api/market-data — Twelve Data or Yahoo, ?source=
│   │       ├── symbolSearch.js        # GET /api/symbol-search — same source toggle
│   │       └── alertsEngine.js        # hourly timer + POST /api/alerts/run (manual test)
│   ├── local.settings.json(.example)
│   └── README.md                      # endpoints, local dev, Flex Consumption deploy notes
├── src/
│   ├── firebase.js
│   ├── context/AuthContext.jsx
│   ├── hooks/useApi.js                # all API calls; loading/error state
│   ├── lib/
│   │   ├── tradePnl.js, dashboardStats.js, format.js, constants.js
│   │   ├── chartColors.js             # usePrefersDark, getChartColors (literal hex, not CSS vars)
│   │   └── indicators.js              # pure indicator math — see below
│   ├── components/
│   │   ├── NavBar.jsx, PrivateRoute.jsx, TradeDrawer.jsx, TradeSellModal.jsx
│   │   ├── IdeaDrawer.jsx, StatTile.jsx
│   │   ├── TradingViewWidget.jsx      # embeds TradingView's public tv.js widget
│   │   └── TwelveDataChart.jsx        # lightweight-charts render of our own fetched data
│   ├── pages/
│   │   ├── Landing.jsx, Login.jsx, Register.jsx
│   │   ├── Dashboard.jsx, Trades.jsx, Ideas.jsx, Notes.jsx
│   │   ├── Settings.jsx               # Anthropic API key management (BYOK)
│   │   ├── Assistant.jsx              # chat grounded in journal data
│   │   ├── ChartAnalysis.jsx          # chart + indicators + chat grounded in chart data
│   │   └── Alerts.jsx                 # create/manage price & indicator email alerts
│   ├── App.jsx
│   └── index.css
└── vite.config.js
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

### Settings
```js
{
  id: string,            // same value as userId (one doc per user)
  userId: string,
  anthropicApiKey: string | undefined,
}
```

### Alert
```js
{
  id: string,
  userId: string,
  symbol: string,
  dataSource: 'twelvedata' | 'yahoo',
  interval: '1h' | '4h' | '1day' | '1week',
  matchMode: 'all' | 'any',   // combinator across conditions[] — AND / OR — only matters when length > 1
  conditions: [
    {
      type: 'price',
      priceLevel: number,
      priceDirection: 'above' | 'below',
    } | {
      type: 'indicator',
      indicatorKey: 'cci' | 'rsi' | 'stoch' | 'macd' | 'ema',
      indicatorPeriod: number | undefined,   // unused for 'macd' (fixed 12/26/9)
      indicatorLevel: number | undefined,    // unused for 'macd'/'ema' (zero-cross / price-cross)
      indicatorDirection: 'above' | 'below',
    },
    // ...one or more
  ],
  email: string,
  active: boolean,
  createdAt: string,
  lastTriggeredAt: string | null,
  lastTriggeredCandleTime: number | null,   // dedupes re-firing within the same bar
}
```

Multiple conditions on one alert are evaluated against the same candle set
(same symbol/dataSource/interval) and combined per `matchMode` *before*
edge-triggering — each condition's "currently met" state at the previous
and current candle is computed, the states are AND'd or OR'd together, and
the alert fires only on the transition from combined-not-met to
combined-met. See `api/src/evaluateAlert.js`.

All five containers (`trades`, `ideas`, `notes`, `settings`, `alerts`) live
in Cosmos DB database `paultrading`, partitioned on `/userId`.

## AI Assistant (bring-your-own-key)
`/settings` and `/assistant` pages, plus the chat panel on `/chart`. Each
user pastes their own Anthropic API key (console.anthropic.com) in Settings
— there's no OAuth/login flow for this, it's a manual key generated once per
user. The key is stored server-side in the `settings` Cosmos container and
is **write-only from the client's perspective**: `GET /api/settings` only
ever returns `{ hasAnthropicApiKey: boolean }`, never the raw key.

`POST /api/assistant` (api/src/functions/assistant.js) verifies the Firebase
token, reads the caller's own key from Cosmos, and calls the Anthropic
Messages API (model: `claude-sonnet-5`) server-to-server — the key is never
sent to or visible from the browser. The request body is
`{ message, context, history }`. `context` is built client-side and is
either a summary of the user's trades (Assistant page: stats, P&L by
instrument, monthly performance, last 20 trades) or a chart-analysis payload
(ChartAnalysis page: symbol, interval, recent Heikin Ashi candles, and
whichever indicators are currently enabled with their configured settings).
`history` is the last ~10 chat messages for continuity. The system prompt
embeds that context so the assistant can analyze patterns, build
projections, and reason through scenarios grounded in real data — **it does
not recompute indicator math itself**, it interprets what the app already
computed.

## Chart Analysis (`/chart`)

Two chart surfaces, both driven by one toolbar (symbol search, data source,
interval, candle style, indicators dropdown). **Our own chart is always the
primary view (on top); TradingView is the optional "Compare" panel below
it** — the reverse of the original layout, changed because our chart is the
one rendering the exact data Claude analyzes, so it should be what's seen
by default. Both charts render with gridlines off (`grid.vertLines/
horzLines.visible: false` in lightweight-charts; `overrides` with
transparent `paneProperties.vert/horzGridProperties.color` on the
TradingView widget) for a clean look — axis border lines stay.

- **Our chart** (`TwelveDataChart.jsx`, `lightweight-charts`, despite the
  filename it renders whichever source is selected — Twelve Data or Yahoo)
  — renders the exact data Claude analyzes. Bars are positioned by
  sequential index rather than real timestamp so non-trading periods take
  up no axis space on any timeframe; real dates are recovered for axis
  labels/tooltips by looking the index back up in the candle array.
  Double-clicking a line reopens that indicator's settings (only wired up
  here — the TradingView widget is a cross-origin iframe we can't intercept
  clicks inside).
- **TradingView widget** (`TradingViewWidget.jsx`), toggled via the
  "Compare" button — TradingView's own public embeddable widget
  (`s3.tradingview.com/tv.js`), used purely for visual reference. This is a
  legitimate public embed, not scraping. Its own top toolbar and in-widget
  symbol/interval change are disabled (`hide_top_toolbar`,
  `allow_symbol_change: false`) so our toolbar stays the single source of
  truth. Configured indicator periods are pushed in via `studies_overrides`
  on a best-effort basis (the free widget doesn't officially document these
  keys, and can't uniquely configure two instances of the same study type).
  **Important constraint: the free widget always pulls TradingView's own
  live feed for whatever symbol it's given — there is no way to feed it our
  fetched candles.** For Twelve Data symbols this is usually a close visual
  match (`toTradingViewSymbol` just strips the `/`, e.g. `XAU/USD` →
  `XAUUSD`). For Yahoo, symbols use a completely different format
  (`GC=F`, `^GSPC`, `BTC-USD`, `EURUSD=X`), so `yahooToTradingViewSymbol` in
  `ChartAnalysis.jsx` best-effort maps common futures roots/indices/forex/
  crypto suffixes to a TradingView symbol (e.g. `GC=F` → `COMEX:GC1!`);
  plain equity/ETF tickers pass through unchanged. Unmapped symbols hide the
  Compare panel with a note rather than showing a wrong or broken chart.
  Because the feeds are genuinely different providers, the two charts show
  the same real-world instrument for visual cross-checking, not
  bar-for-bar identical data — that's a hard limitation of the free widget,
  not a bug.

Indicators (`src/lib/indicators.js`, pure functions, no side effects): EMA,
SMA, Bollinger Bands, CCI, RSI, MACD, ATR, Stochastic, and a Heikin Ashi
transform. Each has user-editable settings in the Indicators dropdown
(period/fast/slow/signal/etc.) that drive both charts and the Claude
context — **Parabolic SAR and ADX are not implemented yet** even though
they're referenced in "Trading Strategy Context" below; add them here if/when
the strategy needs them.

### Market data — `GET /api/market-data` (Twelve Data or Yahoo Finance, user-selectable)
`marketData.js` fetches from either provider based on a `source` query
param (`twelvedata` | `yahoo`, defaults to `twelvedata`) — a toggle in the
ChartAnalysis toolbar, not a silent fallback. **The two providers use
different symbol formats for the same instrument** (`XAU/USD` vs `GC=F`),
so switching source clears the loaded symbol rather than trying to reuse
it. Both are normalized to the same
`{ time, dateLabel, open, high, low, close }` candle shape before
returning, so nothing downstream (indicators.js, both charts, the Claude
context) needs to know which source served a given request.

- **Twelve Data** (`TWELVE_DATA_API_KEY`, app-wide, not per-user): always
  requests `timezone=UTC` explicitly and parses intraday datetimes with an
  explicit UTC marker — without both of these, daily bars drift by hours
  against the TradingView widget and can land on the wrong calendar date
  depending on the server's own local timezone.
- **Yahoo Finance** (`yahoo-finance2` npm package, no API key needed):
  useful for instruments a given Twelve Data plan doesn't include (e.g.
  Silver isn't on the current plan; Yahoo has it as `SI=F`). Confirmed
  against live data before building this: Yahoo has no native 4-hour
  granularity, so `interval=4h` fetches hourly candles and buckets them
  into 4-hour bars server-side (`aggregateHourlyTo4h`).

Both sources drop Saturday/Sunday bars for anything except crypto — Twelve
Data returns real, non-flat weekend candles for forex/metals that aren't
legitimate trading days (confirmed by inspecting live responses, not a
display artifact); Yahoo doesn't have this problem on its own but gets the
same filter for consistency. Crypto is detected per-provider:
`meta.type === 'Digital Currency'` (Twelve Data) or
`meta.instrumentType === 'CRYPTOCURRENCY'` (Yahoo).

### Symbol search — `GET /api/symbol-search`
Same `source` param as market-data. Proxies Twelve Data's `symbol_search`
or Yahoo's `.search()` so the chart page can suggest real instruments (any
symbol, unlimited — not a fixed list) as the user types, scoped to
whichever provider is currently selected, instead of requiring that
provider's exact symbol format.

## Alerts (`/alerts`)

Email alerts, evaluated hourly in the background — the first real piece of
the "app does the heavy lifting, Claude only analyzes" direction. A user
creates an alert (any symbol, either data source, either a price level or
an indicator condition), and `api/src/functions/alertsEngine.js` — an
**hourly timer trigger** (`app.timer`, `0 0 * * * *`) — checks every active
alert across all users, grouping by `(symbol, dataSource, interval)` so two
users watching the same symbol only cost one market-data fetch (this is the
opt-in-watchlist cost-control idea below, just scoped to "what you've
actually created an alert for" rather than a separate watchlist concept).

Conditions are **edge-triggered** (crossing detection using the last two
candles/indicator points, not "is currently true") so an alert fires once
per crossing instead of every hour a condition happens to still hold —
tracked via `lastTriggeredCandleTime` on the alert doc. Indicator alerts
reuse the exact same math as the chart: `api/src/lib/indicators.js` is a
straight port of `src/lib/indicators.js` (pure functions, no browser
dependencies, so no logic changed in the port). Email delivery is Gmail
SMTP via `nodemailer` (`api/src/sendEmail.js`, `service: 'gmail'`), app
settings `GMAIL_USER` + `GMAIL_APP_PASSWORD` (a Google App Password, not
the account password — requires 2-Step Verification enabled on the
account).

Because a timer trigger is painful to test locally (see `api/README.md`'s
"Local dev limitation" note — it needs a real `AzureWebJobsStorage`, which
this project's local dev leaves empty), the exact same check logic is also
exposed as `POST /api/alerts/run` for on-demand testing, surfaced as a
"Check now" button on the Alerts page.

### Planned: broader per-symbol snapshot/trend history
The Alerts engine above evaluates conditions transiently each hour — it
doesn't persist an ongoing history of indicator values or detect trend
phases the way this section originally envisioned. That fuller idea is
still unbuilt and still worth doing on top of the same hourly-timer
infrastructure Alerts now provides:

Suggested new containers (partition key `/symbol` — shared across users,
since the underlying market data is the same regardless of who's watching):
```js
// snapshots
{
  id: string,              // `${symbol}_${isoTimestamp}`
  symbol: string,
  timestamp: string,       // ISO, hourly
  price: number,
  indicators: {...},       // whatever's enabled — same shape as ChartAnalysis's indicator context
  signal: string,           // e.g. 'strong_buy' | 'weak_buy' | 'hold' | 'partial_sell' | 'strong_sell'
  trendPhase: 'beginning' | 'middle' | 'end',
}

// trends — a completed run, written when direction flips
{
  id: string,
  symbol: string,
  direction: 'up' | 'down',
  startTime: string,
  endTime: string,
  startPrice: number,
  endPrice: number,
  movePct: number,
}
```
Claude's role stays analysis/suggestion only, per the "AI Assistant" section
above: the assistant reads precomputed snapshots/trends for symbols on the
user's watchlist and interprets them, it never recomputes the indicator math
itself. Building this requires porting `src/lib/indicators.js`'s pure
functions to run server-side in the timer function (they're already pure
and side-effect-free, so this should be a straight port, not a rewrite) and
adding a signal/trend-phase matrix, currently unwritten — see "Trading
Strategy Context" below for the entry/exit rules that matrix should encode.

## Trading Strategy Context
- Entry: 100 shares at start of new trend (CCI crosses +100 or -100)
- Partial sell: 30-40 shares when trend loses momentum (CCI weakening)
- Re-entry: 100 shares at start of next wave
- Indicators referenced by the strategy: CCI (14), EMA 20/50, Parabolic SAR,
  Heikin Ashi candles — SAR is not implemented in `indicators.js` yet (see
  "Chart Analysis" above)

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
Superseded by Phase 4 below — localStorage was a stepping stone and the app
now talks to Azure Functions directly. Left here for history; don't rebuild
`useStorage.js`.

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

## Phase 4 — Azure Backend
1. Cosmos DB account (serverless), database `paultrading`, containers
   `trades`/`ideas`/`notes`/`settings` (partition key `/userId`)
2. Azure Function App, **Flex Consumption plan**, Node.js 20
3. CORS for the GitHub Pages URL + localhost:5173

Flex Consumption is a different deployment model from classic Consumption —
see `api/README.md` for the gotchas (blob-storage-backed deploys, no
`FUNCTIONS_WORKER_RUNTIME` app setting, lazy-init Cosmos/Firebase clients to
avoid a silent module-load-time crash that shows up as "0 functions found").

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
- Never hardcode a fixed instrument list — instruments are always free text
- Indicator functions in `src/lib/indicators.js` must stay pure (no side
  effects) so they can eventually be ported to run server-side unchanged
- Commit locally after each change; do not `git push` (which triggers a live
  deploy) until explicitly told to
