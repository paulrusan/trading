// Builds the readable text summary and the small two-panel "sketch" graphic (daily trend
// permission next to the hourly entry trigger) attached to a trigger email. Not a real
// chart of actual prices — a schematic that shows the *shape* of the setup (daily trending
// up/down with its CCI on the same side of zero, the entry timeframe just confirming it),
// matching what the alert rule actually checks (see CLAUDE.md's "Alerts" section).

const INTERVAL_LABEL = { '1h': '1h', '4h': '4h', '1day': 'Daily', '1week': 'Weekly' }
const INDICATOR_NAME = { cci: 'CCI', rsi: 'RSI', stoch: 'Stochastic %K', macd: 'MACD histogram', ema: 'EMA' }

function formatDetailLine(detail) {
  const intervalLabel = INTERVAL_LABEL[detail.interval] ?? detail.interval

  if (detail.type === 'haColor') {
    return `${intervalLabel} Heikin Ashi: ${detail.haColor}`
  }
  if (detail.type === 'price') {
    const valuePart = detail.value != null ? ` (now ${detail.value})` : ''
    return `${intervalLabel} price ${detail.priceDirection} ${detail.priceLevel}${valuePart}`
  }

  const name = INDICATOR_NAME[detail.indicatorKey] ?? detail.indicatorKey
  const periodPart = detail.indicatorPeriod != null ? `(${detail.indicatorPeriod})` : ''
  const valuePart = detail.value != null ? `, value ${detail.value.toFixed(2)}` : ''
  return `${intervalLabel} ${name}${periodPart}: ${detail.indicatorDirection} ${detail.indicatorLevel}${valuePart}`
}

// Instrument name first, then one line per condition — replaces the old single AND-joined
// sentence with something scannable at a glance on a phone.
export function buildAlertEmailText(alert, result) {
  return [alert.symbol, '', ...result.details.map(formatDetailLine)].join('\n')
}

// Only builds the graphic for the shape this app's own presets actually use (a daily CCI
// permission condition + an entry-interval CCI condition) — anything else falls back to
// text-only rather than guessing at a layout for a condition combo this hasn't been
// designed for.
function pickChartDetails(alert, result) {
  const daily = result.details.find(
    (d) => d.interval === '1day' && d.type === 'indicator' && d.indicatorKey === 'cci' && d.value != null,
  )
  const entry = result.details.find(
    (d) => d.interval === alert.interval && d.type === 'indicator' && d.indicatorKey === 'cci' && d.value != null,
  )
  if (!daily || !entry) return null
  return { direction: daily.indicatorDirection === 'above' ? 'up' : 'down', daily, entry }
}

const UP_COLOR = '#16a34a'
const DOWN_COLOR = '#dc2626'
const MUTED = '#94a3b8'
const AXIS = '#cbd5e1'

// Relative price levels (0 = bottom of the panel, 1 = top) for the oscillator strip, which
// stays smoothly on one side of zero the whole time — that's the *stable* gating signal
// (CCI can sit positive/negative for a long stretch; see CLAUDE.md's "Alerts" section on
// why sessions are CCI-sign-based, not Heikin-Ashi-based).
const PULLBACK_LEVELS_UP = [0.35, 0.55, 0.68, 0.5, 0.72, 0.88]
const PULLBACK_LEVELS_DOWN = PULLBACK_LEVELS_UP.map((v) => 1 - v)

// The candles tell a different, faster story: a couple of bars still going the *other*
// way, then the Heikin Ashi color flip that's the actual entry trigger, continuing in the
// trend direction after that — not a smooth line. Explicit (open, close) pairs (0 = bottom,
// 1 = top) rather than a single levels array, so each bar's color is exactly controlled
// instead of inferred from a "previous close" hack.
const CANDLE_BARS_UP = [
  { open: 0.62, close: 0.52 },
  { open: 0.52, close: 0.4 },
  { open: 0.4, close: 0.5 },
  { open: 0.5, close: 0.64 },
  { open: 0.64, close: 0.78 },
  { open: 0.78, close: 0.9 },
]
const CANDLE_BARS_DOWN = CANDLE_BARS_UP.map(({ open, close }) => ({ open: 1 - open, close: 1 - close }))

function candlesticksSvg(x0, top, width, height, direction) {
  const bars = direction === 'up' ? CANDLE_BARS_UP : CANDLE_BARS_DOWN
  const n = bars.length
  const slot = width / n
  const bodyWidth = slot * 0.55
  const toY = (level) => top + height - level * height

  let svg = ''
  for (let i = 0; i < n; i++) {
    const openY = toY(bars[i].open)
    const closeY = toY(bars[i].close)
    const cx = x0 + slot * i + (slot - bodyWidth) / 2
    const top_ = Math.min(openY, closeY)
    const h = Math.max(2, Math.abs(closeY - openY))
    const color = closeY < openY ? UP_COLOR : DOWN_COLOR // SVG y grows downward: lower y = higher price = green
    svg += `<rect x="${cx.toFixed(1)}" y="${top_.toFixed(1)}" width="${bodyWidth.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" rx="1.5"/>`
  }
  return svg
}

function oscillatorSvg(x0, top, width, height, direction) {
  const zeroY = top + height / 2
  const levels = direction === 'up' ? PULLBACK_LEVELS_UP : PULLBACK_LEVELS_DOWN
  const n = levels.length
  // Keep the whole line on one side of zero (that's the point being illustrated), just
  // wobbling in proportion to the same pullback shape used for the candles above.
  const amplitude = height * 0.45
  const sign = direction === 'up' ? -1 : 1
  const points = levels
    .map((level, i) => {
      const x = x0 + (width / (n - 1)) * i
      const y = zeroY + sign * (0.3 + level * 0.85) * amplitude
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const color = direction === 'up' ? UP_COLOR : DOWN_COLOR
  return `
    <line x1="${x0}" y1="${zeroY}" x2="${x0 + width}" y2="${zeroY}" stroke="${AXIS}" stroke-width="1" stroke-dasharray="3,3"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  `
}

// A drawn arrow (line + arrowhead) laid directly over the candle group, following the
// same diagonal the candles themselves trace — like a trendline drawn on top of price
// action, not a separate icon floating in its own lane above/below the bars.
function arrowSvg(xStart, yStart, xEnd, yEnd, color) {
  const angle = Math.atan2(yEnd - yStart, xEnd - xStart)
  const headLen = 11
  const headAngle = Math.PI / 7
  const hx1 = xEnd - headLen * Math.cos(angle - headAngle)
  const hy1 = yEnd - headLen * Math.sin(angle - headAngle)
  const hx2 = xEnd - headLen * Math.cos(angle + headAngle)
  const hy2 = yEnd - headLen * Math.sin(angle + headAngle)

  return `
    <line x1="${xStart.toFixed(1)}" y1="${yStart.toFixed(1)}" x2="${xEnd.toFixed(1)}" y2="${yEnd.toFixed(1)}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
    <polygon points="${xEnd.toFixed(1)},${yEnd.toFixed(1)} ${hx1.toFixed(1)},${hy1.toFixed(1)} ${hx2.toFixed(1)},${hy2.toFixed(1)}" fill="${color}"/>
  `
}

const BASE_CANDLE_TOP = 34
const CANDLE_HEIGHT = 92

function panelSvg({ x0, width, direction, title, subtitle, badge }) {
  const candleTop = BASE_CANDLE_TOP
  const oscTop = candleTop + CANDLE_HEIGHT + 14
  const oscHeight = 52
  const color = direction === 'up' ? UP_COLOR : DOWN_COLOR

  // Traces the same steep diagonal the candles themselves fall along, but offset to the
  // side (above them for a downtrend, below for an uptrend) so it runs right alongside
  // the bars without cutting through any of them. The 0.4/0.78 (and mirrored 0.6/0.22)
  // fractions are the actual near/far candle body edges in this span (see CANDLE_BARS_UP/
  // DOWN) — not arbitrary, so the gap stays constant along the whole line instead of
  // narrowing to nothing (or crossing into the body) at one end.
  const ARROW_GAP = 16
  const arrowXStart = x0 + width * 0.32
  const arrowXEnd = x0 + width * 0.98
  const arrowYStart =
    direction === 'up' ? candleTop + CANDLE_HEIGHT * 0.6 + ARROW_GAP : candleTop + CANDLE_HEIGHT * 0.4 - ARROW_GAP
  const arrowYEnd =
    direction === 'up' ? candleTop + CANDLE_HEIGHT * 0.22 + ARROW_GAP : candleTop + CANDLE_HEIGHT * 0.78 - ARROW_GAP

  // Sits inside the candlestick plot itself — bottom-right for an uptrend, top-right for
  // a downtrend — the corner the diagonal candle/arrow group leaves empty in each case,
  // rather than off in its own strip below the CCI line.
  const badgeWidth = 100
  const badgeHeight = 24
  const badgeX = x0 + width - badgeWidth - 8
  const badgeY = direction === 'up' ? candleTop + CANDLE_HEIGHT - badgeHeight - 6 : candleTop + 6
  const badgeFill = direction === 'up' ? '#dcfce7' : '#fee2e2'
  const badgeSvg = badge
    ? `
      <rect x="${badgeX}" y="${badgeY}" width="${badgeWidth}" height="${badgeHeight}" rx="12" fill="${badgeFill}"/>
      <text x="${badgeX + badgeWidth / 2}" y="${badgeY + badgeHeight / 2 + 4}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="${color}">${badge}</text>
    `
    : ''

  return `
    <text x="${x0 + width / 2}" y="16" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#1e293b">${title}</text>
    ${candlesticksSvg(x0, candleTop, width, CANDLE_HEIGHT, direction)}
    ${arrowSvg(arrowXStart, arrowYStart, arrowXEnd, arrowYEnd, color)}
    ${oscillatorSvg(x0, oscTop, width, oscHeight, direction)}
    <text x="${x0 + width / 2}" y="${oscTop + oscHeight + 10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="${MUTED}">${subtitle}</text>
    ${badgeSvg}
  `
}

// Two side-by-side panels: left = daily trend permission, right = the entry-interval
// trigger, with a colored "Buy area"/"Sell area" badge on the entry panel (or a neutral
// "Wait" badge when they disagree — mirrors the AlertChart page's own Trading column).
export function buildAlertChartSvg(alert, result) {
  const picked = pickChartDetails(alert, result)
  if (!picked) return null
  const { direction, daily, entry } = picked

  const width = 600
  const height = 270
  const panelWidth = 250
  const gap = 60
  const leftX = 20
  const rightX = leftX + panelWidth + gap

  const entryLabel = INTERVAL_LABEL[entry.interval] ?? entry.interval
  const dailySubtitle = `CCI(${daily.indicatorPeriod}) ${direction === 'up' ? 'above' : 'below'} 0 — ${daily.value.toFixed(1)}`
  const entrySubtitle = `CCI(${entry.indicatorPeriod}) ${direction === 'up' ? 'above' : 'below'} 0 — ${entry.value.toFixed(1)}`

  const left = panelSvg({
    x0: leftX,
    width: panelWidth,
    direction,
    title: `Daily — ${direction === 'up' ? 'Uptrend' : 'Downtrend'}`,
    subtitle: dailySubtitle,
  })
  const right = panelSvg({
    x0: rightX,
    width: panelWidth,
    direction,
    title: `${entryLabel} — Entry`,
    subtitle: entrySubtitle,
    badge: direction === 'up' ? 'Buy area' : 'Sell area',
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#ffffff"/>
    ${left}
    <line x1="${leftX + panelWidth + gap / 2}" y1="10" x2="${leftX + panelWidth + gap / 2}" y2="${height - 10}" stroke="${AXIS}" stroke-width="1"/>
    ${right}
  </svg>`
}
