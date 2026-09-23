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
- `GET /api/market-data?symbol=XAU/USD&interval=1day&outputsize=200` —
  proxies Twelve Data's `time_series` endpoint using a single app-wide key
  (not per-user), returns `{ symbol, interval, candles }` with `time` as a
  UNIX timestamp (seconds) for direct use with `lightweight-charts`.
- `GET /api/symbol-search?query=gold` — proxies Twelve Data's
  `symbol_search` endpoint (same app-wide key), returns
  `{ results: [{ symbol, name, exchange, type, country }] }` so the chart
  page's symbol field can suggest instruments as the user types instead of
  requiring an exact Twelve Data symbol format.

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
4. `npm start` (runs `func start`) — API available at `http://localhost:7071/api/...`

Do **not** set `FUNCTIONS_WORKER_RUNTIME` — Flex Consumption manages the
runtime at the resource level (`functionAppConfig.runtime`) and rejects that
app setting outright if present.

## Cosmos DB setup

Database `paultrading` needs four containers, each partitioned on `/userId`:

- `trades`, `ideas`, `notes` — journal data
- `settings` — one document per user, doc id = userId, holds `anthropicApiKey`

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
