import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import { getChartColors, usePrefersDark } from '../lib/chartColors'
import { toHeikinAshi } from '../lib/indicators'

const OSCILLATOR_ORDER = ['cci', 'rsi', 'macd', 'atr', 'stoch', 'adx']
const DEFAULT_VISIBLE_BARS = {
  '1h': 500,
  '4h': 500,
  '1day': 252,
  '1week': 156,
}

function formatTickLabel(unixSeconds, interval) {
  if (!unixSeconds) return ''
  const d = new Date(unixSeconds * 1000)
  if (interval === '1day' || interval === '1week') {
    return d.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' })
  }
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatCrosshairLabel(unixSeconds, interval) {
  if (!unixSeconds) return ''
  const d = new Date(unixSeconds * 1000)
  if (interval === '1day' || interval === '1week') {
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  }
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function TwelveDataChart({
  candles,
  candleType,
  indicators,
  interval,
  height = 400,
  onIndicatorDoubleClick,
  markers,
}) {
  const isDark = usePrefersDark()
  const colors = getChartColors(isDark)

  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Bars are indexed 0..N-1 instead of placed by real UNIX time, so non-trading
    // periods (nights, weekends, holidays) take up no axis space on ANY timeframe —
    // matching how TradingView's own chart compresses gaps. Real dates/times are
    // looked up from `candles` by index for axis labels and the crosshair tooltip.
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: { background: { color: colors.surface }, textColor: colors.textMuted },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      timeScale: {
        borderColor: colors.grid,
        tickMarkFormatter: (time) => formatTickLabel(candles[time]?.time, interval),
      },
      localization: {
        timeFormatter: (time) => formatCrosshairLabel(candles[time]?.time, interval),
      },
      rightPriceScale: { borderColor: colors.grid },
    })

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    resizeObserver.observe(containerRef.current)

    if (candles.length > 0) {
      const realTimeToIndex = new Map(candles.map((c, i) => [c.time, i]))
      const reindex = (points) => {
        const result = []
        for (const p of points) {
          const idx = realTimeToIndex.get(p.time)
          if (idx !== undefined) result.push({ ...p, time: idx })
        }
        return result
      }

      const displayCandles = (candleType === 'heikinAshi' ? toHeikinAshi(candles) : candles).map(
        (c, i) => ({ ...c, time: i }),
      )

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

      // Marker times are real UNIX seconds (e.g. a trend's startTime) — mapped to the
      // candle's index like everything else here, falling back to the nearest candle
      // if there's no exact match (a trend start time is always set from an actual
      // candle in computeSnapshot.js, so this should be rare in practice).
      if (markers?.length) {
        const converted = []
        for (const m of markers) {
          let idx = realTimeToIndex.get(m.time)
          if (idx === undefined) {
            let nearestTime = null
            let nearestDiff = Infinity
            for (const c of candles) {
              const diff = Math.abs(c.time - m.time)
              if (diff < nearestDiff) {
                nearestDiff = diff
                nearestTime = c.time
              }
            }
            idx = nearestTime !== null ? realTimeToIndex.get(nearestTime) : undefined
          }
          if (idx === undefined) continue
          converted.push({
            time: idx,
            position: m.position ?? 'belowBar',
            color: m.color,
            shape: m.shape ?? 'arrowUp',
            text: m.text,
          })
        }
        if (converted.length > 0) createSeriesMarkers(candleSeries, converted)
      }

      // Tracks which indicator key each overlay/oscillator line belongs to, so a
      // double-click near a line can reopen that indicator's settings.
      const hitTestSeries = []

      // lastValueVisible/priceLineVisible off on every price-pane overlay line below — only
      // the candlestick series shows a price badge/line, otherwise each enabled overlay
      // (EMA, SMA, Bollinger Bands, SAR) stacks its own duplicate badge on the right edge.
      if (indicators.ema) {
        const s = chart.addSeries(
          LineSeries,
          { color: colors.accent, lineWidth: 1, lastValueVisible: false, priceLineVisible: false },
          0,
        )
        s.setData(reindex(indicators.ema.points))
        hitTestSeries.push({ key: 'ema', series: s })
      }
      if (indicators.sma) {
        const s = chart.addSeries(
          LineSeries,
          {
            color: colors.accent,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            lastValueVisible: false,
            priceLineVisible: false,
          },
          0,
        )
        s.setData(reindex(indicators.sma.points))
        hitTestSeries.push({ key: 'sma', series: s })
      }
      if (indicators.bb) {
        const basisSeries = chart.addSeries(
          LineSeries,
          { color: colors.textMuted, lineWidth: 1, lastValueVisible: false, priceLineVisible: false },
          0,
        )
        basisSeries.setData(reindex(indicators.bb.basis))
        const upperSeries = chart.addSeries(
          LineSeries,
          {
            color: colors.textMuted,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            lastValueVisible: false,
            priceLineVisible: false,
          },
          0,
        )
        upperSeries.setData(reindex(indicators.bb.upper))
        const lowerSeries = chart.addSeries(
          LineSeries,
          {
            color: colors.textMuted,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            lastValueVisible: false,
            priceLineVisible: false,
          },
          0,
        )
        lowerSeries.setData(reindex(indicators.bb.lower))
        hitTestSeries.push({ key: 'bb', series: basisSeries })
        hitTestSeries.push({ key: 'bb', series: upperSeries })
        hitTestSeries.push({ key: 'bb', series: lowerSeries })
      }
      if (indicators.sar) {
        const s = chart.addSeries(
          LineSeries,
          {
            color: colors.accent,
            lineVisible: false,
            pointMarkersVisible: true,
            pointMarkersRadius: 2,
            lastValueVisible: false,
            priceLineVisible: false,
          },
          0,
        )
        s.setData(reindex(indicators.sar.points))
        hitTestSeries.push({ key: 'sar', series: s })
      }

      const enabledOscillators = OSCILLATOR_ORDER.filter((key) => indicators[key])
      enabledOscillators.forEach((key, idx) => {
        const paneIndex = idx + 1
        if (key === 'cci' || key === 'rsi' || key === 'atr' || key === 'adx') {
          const s = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, paneIndex)
          s.setData(reindex(indicators[key].points))
          hitTestSeries.push({ key, series: s })
        } else if (key === 'macd') {
          const macdSeries = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, paneIndex)
          macdSeries.setData(reindex(indicators.macd.macdLine))

          const signalSeries = chart.addSeries(LineSeries, { color: colors.textMuted, lineWidth: 1 }, paneIndex)
          signalSeries.setData(reindex(indicators.macd.signalLine))

          const histSeries = chart.addSeries(HistogramSeries, { color: colors.profit }, paneIndex)
          histSeries.setData(
            reindex(
              indicators.macd.histogram.map((p) => ({
                time: p.time,
                value: p.value,
                color: p.value >= 0 ? colors.profit : colors.loss,
              })),
            ),
          )
          hitTestSeries.push({ key: 'macd', series: macdSeries })
          hitTestSeries.push({ key: 'macd', series: signalSeries })
        } else if (key === 'stoch') {
          const kSeries = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 1 }, paneIndex)
          kSeries.setData(reindex(indicators.stoch.k))

          const dSeries = chart.addSeries(LineSeries, { color: colors.textMuted, lineWidth: 1 }, paneIndex)
          dSeries.setData(reindex(indicators.stoch.d))
          hitTestSeries.push({ key: 'stoch', series: kSeries })
          hitTestSeries.push({ key: 'stoch', series: dSeries })
        }
      })

      const barCount = DEFAULT_VISIBLE_BARS[interval] ?? 252
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, candles.length - barCount),
        to: candles.length - 1,
      })

      const handleDblClick = (param) => {
        if (!onIndicatorDoubleClick || !param.point || !param.seriesData) return
        let closestKey = null
        let closestDist = 10
        for (const { key, series } of hitTestSeries) {
          const data = param.seriesData.get(series)
          if (!data || data.value === undefined) continue
          const y = series.priceToCoordinate(data.value)
          if (y === null) continue
          const dist = Math.abs(y - param.point.y)
          if (dist < closestDist) {
            closestDist = dist
            closestKey = key
          }
        }
        if (closestKey) onIndicatorDoubleClick(closestKey)
      }
      chart.subscribeDblClick(handleDblClick)

      return () => {
        chart.unsubscribeDblClick(handleDblClick)
        resizeObserver.disconnect()
        chart.remove()
      }
    }

    return () => {
      resizeObserver.disconnect()
      chart.remove()
    }
  }, [colors, candles, candleType, indicators, interval, height, onIndicatorDoubleClick, markers])

  return <div ref={containerRef} style={{ height }} className="overflow-hidden rounded-lg border border-border" />
}
