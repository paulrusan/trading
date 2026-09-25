export const TV_INTERVAL = { '1h': '60', '4h': '240', '1day': 'D', '1week': 'W' }
export const TV_STYLE = { simple: 1, heikinAshi: 8 }

// Best-effort Yahoo -> TradingView symbol mapping: TradingView's free widget always pulls
// its OWN live feed for whatever symbol it's given, so this can only point it at the same
// real-world instrument, not literally replay Yahoo's bars — the two will rarely be
// pixel-identical. Unmapped symbols (unknown futures roots, indices) return null and the
// compare panel hides.
const YAHOO_FUTURES_ROOT_TO_TV = {
  GC: 'COMEX:GC1!',
  MGC: 'COMEX_MINI:MGC1!', // Micro Gold
  SI: 'COMEX:SI1!',
  SIL: 'COMEX_MINI:SIL1!', // Micro Silver
  CL: 'NYMEX:CL1!',
  MCL: 'NYMEX:MCL1!', // Micro Crude Oil
  NG: 'NYMEX:NG1!',
  HG: 'COMEX:HG1!',
  ZC: 'CBOT:ZC1!',
  ZS: 'CBOT:ZS1!',
  ZW: 'CBOT:ZW1!',
  ES: 'CME:ES1!',
  MES: 'CME_MINI:MES1!', // Micro E-mini S&P 500
  NQ: 'CME:NQ1!',
  MNQ: 'CME_MINI:MNQ1!', // Micro E-mini Nasdaq-100
  YM: 'CBOT:YM1!',
  MYM: 'CBOT_MINI:MYM1!', // Micro E-mini Dow
}
const YAHOO_INDEX_TO_TV = {
  '^GSPC': 'SP:SPX',
  '^DJI': 'DJ:DJI',
  '^IXIC': 'NASDAQ:IXIC',
  '^RUT': 'TVC:RUT',
  '^VIX': 'TVC:VIX',
}

function yahooToTradingViewSymbol(symbol) {
  if (!symbol) return null
  if (YAHOO_INDEX_TO_TV[symbol]) return YAHOO_INDEX_TO_TV[symbol]
  if (symbol.startsWith('^')) return null
  if (symbol.endsWith('=F')) return YAHOO_FUTURES_ROOT_TO_TV[symbol.slice(0, -2)] ?? null
  if (symbol.endsWith('=X')) return `FX:${symbol.slice(0, -2)}`
  if (symbol.endsWith('-USD')) return symbol.replace('-', '')
  return symbol // plain equity/ETF ticker — TradingView's widget resolves bare tickers fine
}

// Twelve Data forex/metal pairs (e.g. "USD/CAD", "XAU/USD") need an exchange prefix for
// TradingView to resolve the right instrument — a bare "USDCAD" (no prefix) was silently
// resolving to something else entirely. FX_IDC is TradingView's aggregate forex/metals
// composite feed, broad enough to cover both majors and precious metals against a fiat.
const FOREX_METAL_CODES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD',
  'CNY', 'HKD', 'SGD', 'SEK', 'NOK', 'DKK', 'MXN', 'ZAR', 'TRY', 'INR', 'BRL', 'PLN',
  'XAU', 'XAG', 'XPT', 'XPD',
])
const FOREX_PAIR_RE = /^([A-Z]{3})\/([A-Z]{3})$/

function isForexOrMetalPair(symbol) {
  const match = FOREX_PAIR_RE.exec(symbol)
  return !!match && FOREX_METAL_CODES.has(match[1]) && FOREX_METAL_CODES.has(match[2])
}

export function toTradingViewSymbol(symbol, dataSource) {
  if (!symbol) return null
  if (dataSource === 'yahoo') return yahooToTradingViewSymbol(symbol)
  if (isForexOrMetalPair(symbol)) return `FX_IDC:${symbol.replace('/', '')}`
  return symbol.replace('/', '')
}
