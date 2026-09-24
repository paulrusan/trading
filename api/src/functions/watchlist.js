import { registerCrudRoutes } from '../crudRoutes.js'

// Per-user list of symbols to snapshot hourly (opt-in — not every instrument by
// default, but any instrument is eligible). Shape: { symbol, dataSource, interval }.
// snapshotsEngine.js dedupes across users the same way alertsEngine.js dedupes alerts.
registerCrudRoutes('watchlist', 'watchlist')
