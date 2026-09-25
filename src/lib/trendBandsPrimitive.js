// A minimal lightweight-charts v5 series primitive that paints full-pane-height vertical
// bands behind the candles — used for the light green/red trend-session highlight on
// AlertChart.jsx. There's no built-in "background band" series type in the public API;
// this is the documented mechanism (ISeriesPrimitive + pane view + renderer) for drawing
// something that isn't tied to the price scale, only to the time axis.
class TrendBandsPaneRenderer {
  constructor(bands) {
    this._bands = bands
  }

  draw() {}

  // The library's own docs call this hook out for exactly this ("time areas
  // highlighting"), so bands render as a true background layer regardless of z-order,
  // rather than needing `draw()` + `zOrder() { return 'bottom' }` to approximate it.
  drawBackground(target) {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const height = scope.bitmapSize.height
      const ratio = scope.horizontalPixelRatio
      for (const band of this._bands) {
        if (band.x1 == null || band.x2 == null) continue
        const left = Math.min(band.x1, band.x2) * ratio
        const right = Math.max(band.x1, band.x2) * ratio
        ctx.fillStyle = band.color
        ctx.fillRect(left, 0, Math.max(1, right - left), height)
      }
    })
  }
}

class TrendBandsPaneView {
  constructor(source) {
    this._source = source
    this._bands = []
  }

  update() {
    const timeScale = this._source.chart?.timeScale()
    if (!timeScale) {
      this._bands = []
      return
    }
    // toIndex + 1 is the left edge of the *next* bar — used as this band's right edge so it
    // reaches all the way to the following bar rather than stopping mid-bar. For the
    // still-open current session, toIndex is the very last candle in the dataset, so
    // toIndex + 1 has no coordinate (timeToCoordinate returns null) and the band would
    // otherwise silently not draw at all — fall back to the last bar's own coordinate plus
    // one bar's pixel width in that case.
    const barSpacing = timeScale.options().barSpacing
    this._bands = this._source.segments.map((s) => {
      let x2 = timeScale.timeToCoordinate(s.toIndex + 1)
      if (x2 == null) {
        const lastBarX = timeScale.timeToCoordinate(s.toIndex)
        x2 = lastBarX != null ? lastBarX + barSpacing : null
      }
      return {
        x1: timeScale.timeToCoordinate(s.fromIndex),
        x2,
        color: s.color,
      }
    })
  }

  renderer() {
    return new TrendBandsPaneRenderer(this._bands)
  }
}

export class TrendBandsPrimitive {
  constructor(segments) {
    this.segments = segments // [{ fromIndex, toIndex, color }], index-space (chart's own "time")
    this.chart = null
    this._paneViews = [new TrendBandsPaneView(this)]
  }

  attached({ chart }) {
    this.chart = chart
  }

  detached() {
    this.chart = null
  }

  updateAllViews() {
    for (const view of this._paneViews) view.update()
  }

  paneViews() {
    return this._paneViews
  }
}
