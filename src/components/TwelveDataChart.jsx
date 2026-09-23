import { CandlestickSeries, HistogramSeries, LineSeries, LineStyle, createChart } from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import { getChartColors, usePrefersDark } from '../lib/chartColors'
import { toHeikinAshi } from '../lib/indicators'

const OSCILLATOR_ORDER = ['cci', 'rsi', 'macd', 'atr', 'stoch']
const DEFAULT_VISIBLE_DAYS = {
  '1h': 30,
  '4h': 90,
  '1day': 365,
  '1week': 365 * 3,
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
      candleSeries.setData(displayCandles)

      if (indicators.ema1) {
        const s = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, 0)
        s.setData(indicators.ema1.points)
      }
      if (indicators.ema2) {
        const s = chart.addSeries(LineSeries, { color: colors.textMuted, lineWidth: 1 }, 0)
        s.setData(indicators.ema2.points)
      }
      if (indicators.sma) {
        const s = chart.addSeries(
          LineSeries,
          { color: colors.accent, lineWidth: 1, lineStyle: LineStyle.Dashed },
          0,
        )
        s.setData(indicators.sma.points)
      }
      if (indicators.bb) {
        const basisSeries = chart.addSeries(LineSeries, { color: colors.textMuted, lineWidth: 1 }, 0)
        basisSeries.setData(indicators.bb.basis)
        const upperSeries = chart.addSeries(
          LineSeries,
          { color: colors.textMuted, lineWidth: 1, lineStyle: LineStyle.Dotted },
          0,
        )
        upperSeries.setData(indicators.bb.upper)
        const lowerSeries = chart.addSeries(
          LineSeries,
          { color: colors.textMuted, lineWidth: 1, lineStyle: LineStyle.Dotted },
          0,
        )
        lowerSeries.setData(indicators.bb.lower)
      }

      const enabledOscillators = OSCILLATOR_ORDER.filter((key) => indicators[key])
      enabledOscillators.forEach((key, idx) => {
        const paneIndex = idx + 1
        if (key === 'cci' || key === 'rsi' || key === 'atr') {
          const s = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, paneIndex)
          s.setData(indicators[key].points)
        } else if (key === 'macd') {
          const macdSeries = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, paneIndex)
          macdSeries.setData(indicators.macd.macdLine)

          const signalSeries = chart.addSeries(LineSeries, { color: colors.textMuted, lineWidth: 1 }, paneIndex)
          signalSeries.setData(indicators.macd.signalLine)

          const histSeries = chart.addSeries(HistogramSeries, { color: colors.profit }, paneIndex)
          histSeries.setData(
            indicators.macd.histogram.map((p) => ({
              time: p.time,
              value: p.value,
              color: p.value >= 0 ? colors.profit : colors.loss,
            })),
          )
        } else if (key === 'stoch') {
          const kSeries = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, paneIndex)
          kSeries.setData(indicators.stoch.k)

          const dSeries = chart.addSeries(LineSeries, { color: colors.textMuted, lineWidth: 1 }, paneIndex)
          dSeries.setData(indicators.stoch.d)
        }
      })

      const firstTime = candles[0]?.time
      const lastTime = candles[candles.length - 1]?.time
      if (firstTime && lastTime) {
        const spanSeconds = (DEFAULT_VISIBLE_DAYS[interval] ?? 365) * 24 * 60 * 60
        const fromTime = Math.max(firstTime, lastTime - spanSeconds)
        chart.timeScale().setVisibleRange({ from: fromTime, to: lastTime })
      }
    }

    return () => {
      resizeObserver.disconnect()
      chart.remove()
    }
  }, [colors, candles, candleType, indicators, interval, height])

  return <div ref={containerRef} style={{ height }} className="overflow-hidden rounded-lg border border-border" />
}
