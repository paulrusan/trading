import { CandlestickSeries, HistogramSeries, LineSeries, LineStyle, createChart } from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import { getChartColors, usePrefersDark } from '../lib/chartColors'
import { toHeikinAshi } from '../lib/indicators'

const OSCILLATOR_ORDER = ['cci', 'rsi', 'macd', 'atr', 'stoch']
// Default zoom expressed as a bar count (not calendar time) so it's unaffected by
// non-trading days being skipped — see toChartTime below.
const DEFAULT_VISIBLE_BARS = {
  '1h': 500,
  '4h': 500,
  '1day': 252,
  '1week': 156,
}

// Daily/weekly bars use TradingView's "business day" time format, which lightweight-charts
// positions at consecutive indices rather than real elapsed time — this is what skips
// weekends/holidays instead of rendering them as blank gaps. Intraday bars keep a real
// UNIX timestamp since business-day format has no time-of-day component.
function toChartTime(unixSeconds, interval) {
  if (interval !== '1day' && interval !== '1week') return unixSeconds
  const d = new Date(unixSeconds * 1000)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

function mapTime(points, interval) {
  return points.map((p) => ({ ...p, time: toChartTime(p.time, interval) }))
}

export function TwelveDataChart({ candles, candleType, indicators, interval, height = 400 }) {
  const isDark = usePrefersDark()
  const colors = getChartColors(isDark)

  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: { background: { color: colors.surface }, textColor: colors.textMuted },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      timeScale: { borderColor: colors.grid },
      rightPriceScale: { borderColor: colors.grid },
    })

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    resizeObserver.observe(containerRef.current)

    if (candles.length > 0) {
      const displayCandles = candleType === 'heikinAshi' ? toHeikinAshi(candles) : candles

      const candleSeries = chart.addSeries(
        CandlestickSeries,
        {
          upColor: colors.profit,
          downColor: colors.loss,
          borderVisible: false,
          wickUpColor: colors.profit,
          wickDownColor: colors.loss,
        },
        0,
      )
      candleSeries.setData(mapTime(displayCandles, interval))

      if (indicators.ema1) {
        const s = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, 0)
        s.setData(mapTime(indicators.ema1.points, interval))
      }
      if (indicators.ema2) {
        const s = chart.addSeries(LineSeries, { color: colors.textMuted, lineWidth: 1 }, 0)
        s.setData(mapTime(indicators.ema2.points, interval))
      }
      if (indicators.sma) {
        const s = chart.addSeries(
          LineSeries,
          { color: colors.accent, lineWidth: 1, lineStyle: LineStyle.Dashed },
          0,
        )
        s.setData(mapTime(indicators.sma.points, interval))
      }
      if (indicators.bb) {
        const basisSeries = chart.addSeries(LineSeries, { color: colors.textMuted, lineWidth: 1 }, 0)
        basisSeries.setData(mapTime(indicators.bb.basis, interval))
        const upperSeries = chart.addSeries(
          LineSeries,
          { color: colors.textMuted, lineWidth: 1, lineStyle: LineStyle.Dotted },
          0,
        )
        upperSeries.setData(mapTime(indicators.bb.upper, interval))
        const lowerSeries = chart.addSeries(
          LineSeries,
          { color: colors.textMuted, lineWidth: 1, lineStyle: LineStyle.Dotted },
          0,
        )
        lowerSeries.setData(mapTime(indicators.bb.lower, interval))
      }

      const enabledOscillators = OSCILLATOR_ORDER.filter((key) => indicators[key])
      enabledOscillators.forEach((key, idx) => {
        const paneIndex = idx + 1
        if (key === 'cci' || key === 'rsi' || key === 'atr') {
          const s = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, paneIndex)
          s.setData(mapTime(indicators[key].points, interval))
        } else if (key === 'macd') {
          const macdSeries = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, paneIndex)
          macdSeries.setData(mapTime(indicators.macd.macdLine, interval))

          const signalSeries = chart.addSeries(LineSeries, { color: colors.textMuted, lineWidth: 1 }, paneIndex)
          signalSeries.setData(mapTime(indicators.macd.signalLine, interval))

          const histSeries = chart.addSeries(HistogramSeries, { color: colors.profit }, paneIndex)
          histSeries.setData(
            mapTime(
              indicators.macd.histogram.map((p) => ({
                time: p.time,
                value: p.value,
                color: p.value >= 0 ? colors.profit : colors.loss,
              })),
              interval,
            ),
          )
        } else if (key === 'stoch') {
          const kSeries = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, paneIndex)
          kSeries.setData(mapTime(indicators.stoch.k, interval))

          const dSeries = chart.addSeries(LineSeries, { color: colors.textMuted, lineWidth: 1 }, paneIndex)
          dSeries.setData(mapTime(indicators.stoch.d, interval))
        }
      })

      const barCount = DEFAULT_VISIBLE_BARS[interval] ?? 252
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, candles.length - barCount),
        to: candles.length - 1,
      })
    }

    return () => {
      resizeObserver.disconnect()
      chart.remove()
    }
  }, [colors, candles, candleType, indicators, interval, height])

  return <div ref={containerRef} style={{ height }} className="overflow-hidden rounded-lg border border-border" />
}
