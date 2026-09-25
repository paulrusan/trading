import { useEffect, useRef, useState } from 'react'
import { INDICATOR_DEFS } from '../lib/indicatorDefs'

// Self-contained "Indicators ▾" dropdown (checkbox + settings-gear per indicator) plus a
// "clear all" button — shared by ChartAnalysis.jsx and AlertChart.jsx so both pages' full
// indicator sets (and their settings UI) stay in exactly one place. Controlled: the caller
// owns `settings` (see DEFAULT_INDICATOR_STATE in lib/indicatorDefs.js) and receives
// changes via onToggle/onUpdateParam/onClear.
//
// `openRequest` (optional `{ key, token }`, token just needs to change each time) lets a
// caller force this menu open on a specific indicator's settings — used for
// double-click-the-chart-line-to-open-its-settings. A plain `{ key }` prop wouldn't
// re-trigger on repeated double-clicks of the same indicator, hence the token.
export function IndicatorMenu({ settings, onToggle, onUpdateParam, onClear, openRequest }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [openSettingsKey, setOpenSettingsKey] = useState(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!openRequest) return
    setMenuOpen(true)
    setOpenSettingsKey(openRequest.key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.token])

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
        setOpenSettingsKey(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
        >
          Indicators ▾
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-surface p-2 shadow-lg">
            {INDICATOR_DEFS.map((def) => {
              const st = settings[def.key]
              const isSettingsOpen = openSettingsKey === def.key
              return (
                <div key={def.key} className="border-b border-border py-1 last:border-0">
                  <div className="flex items-center justify-between gap-1">
                    <label className="flex flex-1 cursor-pointer items-center gap-1.5 text-xs text-text-muted hover:text-text">
                      <input
                        type="checkbox"
                        checked={st.enabled}
                        onChange={() => onToggle(def.key)}
                        className="accent-accent"
                      />
                      {def.label}
                    </label>
                    <button
                      type="button"
                      onClick={() => setOpenSettingsKey(isSettingsOpen ? null : def.key)}
                      title={`${def.label} settings`}
                      aria-label={`${def.label} settings`}
                      className="text-text-muted hover:text-text"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-3.5 w-3.5"
                      >
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                    </button>
                  </div>
                  {isSettingsOpen && (
                    <div className="mt-1 flex flex-wrap gap-2 pl-5">
                      {def.params.map((p) => (
                        <label key={p.key} className="flex items-center gap-1 text-[11px] text-text-muted">
                          {p.label}
                          <input
                            type="number"
                            value={st[p.key]}
                            onChange={(e) => onUpdateParam(def.key, p.key, Number(e.target.value))}
                            className="w-12 rounded border border-border bg-bg px-1 py-0.5 text-text outline-none focus:border-accent"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <p className="mt-1 px-1 text-[10px] text-text-muted">
              Periods here always drive the chart. The TradingView compare panel mirrors them on a
              best-effort basis, since its free widget doesn't officially document these settings.
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onClear}
        title="Clear all indicators"
        aria-label="Clear all indicators"
        className="rounded border border-border p-1.5 text-text-muted hover:text-loss"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
        >
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>
    </>
  )
}
