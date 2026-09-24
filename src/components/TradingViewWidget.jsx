import { useEffect, useId, useRef } from 'react'

let tvScriptPromise = null
function loadTradingViewScript() {
  if (window.TradingView) return Promise.resolve()
  if (!tvScriptPromise) {
    tvScriptPromise = new Promise((resolve) => {
      const script = document.createElement('script')
      script.src = 'https://s3.tradingview.com/tv.js'
      script.async = true
      script.onload = () => resolve()
      document.head.appendChild(script)
    })
  }
  return tvScriptPromise
}

export function TradingViewWidget({
  symbol,
  interval,
  style,
  studies,
  studiesOverrides,
  theme,
  height = 560,
}) {
  const containerRef = useRef(null)
  const id = `tv-widget-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  useEffect(() => {
    if (!symbol) return
    let cancelled = false

    loadTradingViewScript().then(() => {
      if (cancelled || !containerRef.current) return
      containerRef.current.innerHTML = ''
      // eslint-disable-next-line no-new
      new window.TradingView.widget({
        container_id: id,
        autosize: true,
        symbol,
        interval,
        timezone: 'Etc/UTC',
        theme,
        style,
        locale: 'en',
        studies,
        studies_overrides: studiesOverrides,
        overrides: {
          'paneProperties.vertGridProperties.color': 'rgba(0, 0, 0, 0)',
          'paneProperties.horzGridProperties.color': 'rgba(0, 0, 0, 0)',
        },
        hide_top_toolbar: true,
        hide_legend: true,
        allow_symbol_change: false,
        withdateranges: false,
        save_image: false,
      })
    })

    return () => {
      cancelled = true
    }
  }, [symbol, interval, style, JSON.stringify(studies), JSON.stringify(studiesOverrides), theme, id])

  return (
    <div
      id={id}
      ref={containerRef}
      style={{ height }}
      className="overflow-hidden rounded-lg border border-border"
    />
  )
}
