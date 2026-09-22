# Trading Journal API

Azure Functions (Node.js v4 programming model) backing the trading journal.
CRUD over `/api/trades`, `/api/ideas`, `/api/notes`, backed by Cosmos DB
(partition key `/userId`). Every request must carry a Firebase ID token as
`Authorization: Bearer <token>` — the function verifies it with
Firebase Admin and uses the decoded `uid` as the partition key, so a client
can never read or write another user's data.

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
4. `npm start` (runs `func start`) — API available at `http://localhost:7071/api/...`

## Cosmos DB setup

Database `paultrading` needs three containers, each partitioned on `/userId`:

- `trades`
- `ideas`
- `notes`

Create them via the Azure Portal (Data Explorer → New Container) or CLI if
they don't already exist.

## Deploy

Deploy via the Azure Portal (Function App → Deployment Center) or the CLI:

```
func azure functionapp publish <function-app-name>
```

After deploying, set the same env vars as Application Settings on the
Function App (Configuration → Application settings), and add CORS entries
for `https://accountium.io` and `http://localhost:5173` (Function App → CORS).

CI deploys via `.github/workflows/deploy-api.yml` using
`Azure/functions-action@v1` with a publish-profile secret
(`AZURE_FUNCTIONAPP_PUBLISH_PROFILE`). That action authenticates through
Kudu/SCM, which newer Function Apps (Flex Consumption included) have
disabled by default — enable **SCM Basic Auth Publishing Credentials**
under Configuration → General settings, or the deploy fails with a 401
fetching Kudu app settings.
