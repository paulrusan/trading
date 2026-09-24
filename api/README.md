# Trading Journal API

Azure Functions (Node.js v4 programming model, Flex Consumption plan) backing
the trading journal. Every request must carry a Firebase ID token as
`Authorization: Bearer <token>` — each function verifies it with Firebase
Admin and uses the decoded `uid` to scope data access, so a client can never
read or write another user's data.

## Endpoints

- `GET/POST/DELETE /api/trades`, `/api/ideas`, `/api/notes` — CRUD over
  Cosmos DB (partition key `/userId`).
- `GET/POST/DELETE /api/settings` — per-user settings (currently just an
  Anthropic API key). `GET` only ever returns whether a key is configured,
  never the raw value.
- `POST /api/assistant` — reads the caller's own Anthropic API key from
  `settings` and calls the Anthropic Messages API server-to-server with a
  context payload (journal data, chart data, or both) the frontend builds
  and sends. The key never reaches the browser.
- `GET /api/market-data?symbol=XAU/USD&interval=1day&outputsize=200&source=twelvedata` —
  fetches OHLC candles from either Twelve Data (`time_series`, app-wide key)
  or Yahoo Finance (`yahoo-finance2`, no key needed), selected via
  `source=twelvedata|yahoo` (defaults to `twelvedata`). Returns
  `{ symbol, interval, source, candles }` with `time` as a UNIX timestamp
  (seconds) for direct use with `lightweight-charts`. Both providers'
  responses are normalized to the same candle shape and have weekend bars
  dropped for anything except crypto (Twelve Data returns real, non-flat
  Saturday/Sunday candles for forex/metals — confirmed by inspecting live
  responses, not just a timezone artifact). Yahoo has no native 4-hour
  granularity, so `interval=4h` is fetched hourly and bucketed into 4-hour
  bars server-side. **Twelve Data and Yahoo use different symbol formats**
  for the same instrument (e.g. `XAU/USD` vs `GC=F`) — always search with
  the matching `source` to get a symbol that vendor will actually resolve.
- `GET /api/symbol-search?query=gold&source=twelvedata` — proxies either
  Twelve Data's `symbol_search` or Yahoo Finance's `search()`, selected via
  the same `source` param, returns
  `{ results: [{ symbol, name, exchange, type, country }] }` so the chart
  page's symbol field can suggest real instruments as the user types
  instead of requiring the exact symbol format for whichever provider is
  selected. Yahoo has no separate silver/gold spot symbols the way Twelve
  Data does (`XAG/USD`/`XAU/USD`) — it only has futures (`SI=F`/`GC=F`) and
  ETFs (`SLV`/`GLD`), which is one reason Yahoo exists as an option: it's
  useful for instruments not included in a given Twelve Data plan.
- `GET/POST/DELETE /api/alerts` — CRUD over the `alerts` Cosmos container
  (partition key `/userId`). Each alert is `{ symbol, dataSource, interval,
  matchMode: 'all'|'any', conditions: [...], email, active, lastTriggeredAt,
  lastTriggeredCandleTime }` — an alert can carry multiple conditions
  (price and/or indicator, mixed), combined with AND (`matchMode: 'all'`)
  or OR (`matchMode: 'any'`) before edge-triggering. See
  `src/evaluateAlert.js` for the exact condition shape per type/indicator.
- `POST /api/alerts/run` — manually runs the same alert-checking logic the
  hourly timer runs (see below), for testing without waiting for the clock.
  Returns a summary: `{ alertsActive, groups, checked, triggered, failed }`.
- `GET/POST/DELETE /api/watchlist` — CRUD over the `watchlist` Cosmos
  container (partition key `/userId`). Each entry is
  `{ symbol, dataSource, interval, createdAt }` — opts a symbol into the
  hourly snapshot engine below. See "Watchlist" below.
- `POST /api/snapshots/run` — manually runs the same snapshot logic the
  hourly timer runs, for testing without waiting for the clock. Returns
  `{ watchedActive, groups, updated, trendsClosed, failed }`.
- `POST /api/snapshots/backfill` (body `{ symbol, dataSource, interval }`) —
  reconstructs signal/trend history from candles already available, instead
  of only ever accumulating forward from whenever a symbol was added to the
  watchlist. Returns `{ candles, events, trends }`. See "Watchlist" below.
- `GET /api/snapshots` / `GET /api/trends`
  (`?symbol=&dataSource=&interval=&limit=`) — read-only history for a
  symbol, oldest-first. Unlike the CRUD resources above these aren't scoped
  by `userId` (the data is shared/system-written), just auth-gated like
  everything else.

## Alerts (hourly email checks)

`src/functions/alertsEngine.js` registers an **hourly timer trigger**
(`app.timer`, schedule `0 0 * * * *`) that: queries every `active` alert
across all users, groups them by `(symbol, dataSource, interval)` so two
users watching the same symbol only cost one market-data fetch, evaluates
each alert's condition (`src/evaluateAlert.js`, using indicator math ported
to `src/lib/indicators.js` — an exact copy of the frontend's
`src/lib/indicators.js`, since those functions are pure with no browser
dependencies), and emails via Gmail SMTP on a **crossing** (edge-triggered:
fires once when a condition transitions from not-met to met, using the
last two candles/indicator points — not every hour it stays true). Which
bar most recently triggered an alert is tracked via
`lastTriggeredCandleTime` so the same crossing doesn't re-fire every hour
until a new bar actually arrives.

**Email**: `src/sendEmail.js` sends via Gmail SMTP using `nodemailer`
(`service: 'gmail'`). Needs two app settings: `GMAIL_USER` (the Gmail
address) and `GMAIL_APP_PASSWORD` (a 16-character App Password generated at
myaccount.google.com/apppasswords — this requires 2-Step Verification to be
enabled on the account; a regular account password will not work).

**Local dev limitation**: the timer trigger's listener requires a real
`AzureWebJobsStorage` connection (it tracks its own schedule state in a
blob container) — with the empty value this project uses locally, `func
start` logs `Could not create BlobContainerClient for ScheduleMonitor` and
the timer just never fires locally. Every other function is unaffected;
use `POST /api/alerts/run` (or the "Check now" button on `/alerts`) to
exercise the exact same logic on demand instead. In production, Flex
Consumption already requires a working `AzureWebJobsStorage` for its own
deployment model, so the timer runs there without extra setup — confirmed
this app setting is present on `paultrading` via `az functionapp config
appsettings list`.

## Watchlist (hourly snapshot/trend engine)

`src/functions/snapshotsEngine.js` registers a second **hourly timer
trigger** (`0 5 * * * *` — 5 minutes after Alerts' `0 0 * * * *`, so the two
engines don't both hit the market-data API at the same instant) that:
queries every `watchlist` entry across all users, dedupes by
`(symbol, dataSource, interval)` the same way Alerts dedupes, fetches
candles once per group (Twelve Data's documented max, 5000 — the SMA(200)
below needs that much headroom to warm up), and derives a `signal`
(`strong_buy`/`hold`/`strong_sell`) and `trendPhase` (`beginning`/`middle`)
from **CCI(20) crossing the zero line, confirmed only when price agrees
with the 200-period SMA**. `src/computeSnapshot.js` is a small state
machine, not just a one-shot calculation, since a rejected (noise)
crossing needs to know the *current confirmed regime* to reject correctly,
not just the last signal. That regime (`up`/`down`/`neutral`) and the
current trend's start time/price are carried forward as extra fields on
each `snapshots` document specifically so the next hourly run can read
them back.

This rule was tuned against real data, not guessed — CCI(20) crossing zero
unfiltered was tried first and found *noisier* than the original CCI(14)/
±100 rule (326 vs. 163 flips over ~149 days of real USD/CAD 1h data);
adding the SMA(200) agreement filter cut that to 19, each of which checked
out as a real trend segment on inspection. See CLAUDE.md's "Watchlist"
section for the full comparison table.

When a regime flips (an uptrend reversing into `strong_sell`, or vice
versa), the just-completed run is also written to the `trends` container.

Also exposes `POST /api/snapshots/run` for local testing — same reasoning
as `/api/alerts/run` — and `GET /api/snapshots`/`GET /api/trends` for
reading the history back (used by the Watchlist page and, when the
currently-loaded chart symbol has history, folded into the Claude chat
context as `context.watchlistHistory`).

**Backfill**: the engine above only ever moves forward — it has no memory
of anything before whenever a symbol was first watched. `POST
/api/snapshots/backfill` (`{ symbol, dataSource, interval }`) fixes that by
replaying the exact same signal logic (`backfillTrendHistory` in
`src/computeSnapshot.js`, sharing a `stepSignal` core with the live
`computeSnapshotUpdate` so the two can't drift apart) across the *whole*
candle history already available in one pass, reconstructing every past
signal event and completed trend as if the engine had been running the
entire time. It only writes bars where something happened (a non-`hold`
signal) plus the final/current bar, not every single hourly bar — a few
thousand near-identical `hold` writes for one on-demand call would be slow
and wasteful. `SnapshotDetail.jsx` (the `/snapshot` page) triggers this
automatically the first time it loads a symbol with no trend history yet,
and also exposes a manual "Backfill history" button.

## Local development

1. Install [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local).
2. `npm install`
3. Copy `local.settings.json.example` to `local.settings.json` and fill in:
   - `COSMOS_CONNECTION_STRING` — Cosmos DB primary connection string
   - `COSMOS_DATABASE_NAME` — defaults to `paultrading`
   - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` —
     from the Firebase service account JSON (Project Settings → Service
     accounts → Generate new private key). Keep the `\n` escapes in the
     private key as-is; the code unescapes them at runtime.
   - `TWELVE_DATA_API_KEY` — from twelvedata.com (free tier)
   - `GMAIL_USER` — the Gmail address alerts are sent from
   - `GMAIL_APP_PASSWORD` — a Google App Password (myaccount.google.com/apppasswords),
     not the account's regular password; requires 2-Step Verification enabled
4. `npm start` (runs `func start`) — API available at `http://localhost:7071/api/...`

Do **not** set `FUNCTIONS_WORKER_RUNTIME` — Flex Consumption manages the
runtime at the resource level (`functionAppConfig.runtime`) and rejects that
app setting outright if present.

## Cosmos DB setup

Database `paultrading` needs eight containers:

Partitioned on `/userId`:
- `trades`, `ideas`, `notes` — journal data
- `settings` — one document per user, doc id = userId, holds `anthropicApiKey`
- `alerts` — one document per alert (a user can have many); see the Alerts
  section above for the shape
- `watchlist` — one document per watched symbol (a user can have many); see
  the Watchlist section above

Partitioned on `/symbol` instead (shared across users, since the underlying
market data doesn't depend on who's watching):
- `snapshots`, `trends` — written only by `snapshotsEngine.js`; see the
  Watchlist section above for the shape

Create them via the Azure Portal (Data Explorer → New Container) or a
one-off script using `@azure/cosmos`'s `createIfNotExists` if they don't
already exist.

## Deploy

CI deploys automatically via `.github/workflows/main_paultrading.yml` on push
to `main` (path-filtered to `api/**`). It authenticates to Azure via OIDC
(`azure/login`, no stored credentials) and runs `Azure/functions-action@v1`
against the `api/` subfolder — this works correctly with Flex Consumption's
blob-storage-backed deployment model.

For manual deploys (e.g. to bypass a broken CI run), use Azure Functions Core
Tools directly — this is the officially correct tool for Flex Consumption and
was used to work around early CI issues:

```
npm install -g azure-functions-core-tools@4
cd api
func azure functionapp publish paultrading
```

This requires `az login` first (Azure CLI) so Core Tools can pick up
credentials. After any deploy, if a request 404s where you expect a real
response, check the Function App's **Functions** blade in the portal — an
empty list means indexing failed. Check **Monitoring → Log stream** for
`"Reading functions metadata (Custom)"` / `"N functions found"` around
startup; `0 functions found` with no visible error usually means a
module-load-time crash (e.g. a malformed app-setting value used to construct
a client outside a request handler) rather than a packaging problem.

Application Settings and CORS (`https://accountium.io`,
`https://www.accountium.io`, `http://localhost:5173`) are configured
directly on the Function App (Portal → Configuration, or `az functionapp
config appsettings set` / `az functionapp cors add`) — they are not part of
the deploy pipeline.
