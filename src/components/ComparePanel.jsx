import { TradingViewWidget } from './TradingViewWidget'
import { TV_INTERVAL, TV_STYLE } from '../lib/tradingViewSymbols'

// The "Compare with TradingView" panel — TradingView's own live feed for the same
// instrument, shown for visual reference underneath our own chart. Shared by
// ChartAnalysis.jsx and AlertChart.jsx; the toggle button that shows/hides this stays
// inline in each page's own toolbar (trivial enough not to be worth extracting).
export function ComparePanel({
  show,
  tvSymbol,
  appInterval,
  candleType,
  studies,
  studiesOverrides,
  isDark,
  activeSymbol,
  dataSource,
}) {
  if (!show) return null

  return (
    <div className="mb-6">
      {tvSymbol ? (
        <>
          <p className="mb-2 text-xs text-text-muted">
            TradingView's own live feed for <span className="font-medium text-text">{tvSymbol}</span>,
            shown for visual reference.
            {dataSource === 'yahoo' &&
              ' Yahoo symbols are best-effort mapped to a TradingView symbol, so this may come from a different exchange/contract than the exact data shown above.'}
          </p>
          <TradingViewWidget
            symbol={tvSymbol}
            interval={TV_INTERVAL[appInterval] ?? 'D'}
            style={TV_STYLE[candleType] ?? 1}
            studies={studies}
            studiesOverrides={studiesOverrides}
            theme={isDark ? 'dark' : 'light'}
            height={400}
          />
        </>
      ) : (
        <div className="flex h-[400px] items-center justify-center rounded-lg border border-border bg-surface text-sm text-text-muted">
          TradingView doesn't have a known symbol mapping for {activeSymbol}.
        </div>
      )}
    </div>
  )
}
