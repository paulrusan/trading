import { useEffect, useRef, useState } from 'react'
import { useApi } from '../hooks/useApi'

// Live symbol search/autocomplete, same debounced-search pattern ChartAnalysis.jsx uses
// for its own symbol field — extracted here so other forms that need a real, resolvable
// symbol (not free text a provider might reject) can reuse it instead of duplicating the
// search/dropdown logic.
export function SymbolSearchInput({ dataSource, value, onChange, placeholder, className }) {
  const api = useApi()
  const [query, setQuery] = useState(value ?? '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    setQuery(value ?? '')
  }, [value])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 1) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const data = await api.searchSymbols(q, dataSource)
        setResults(data.results ?? [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, dataSource])

  const select = (symbol) => {
    setQuery(symbol)
    setResults([])
    setOpen(false)
    onChange(symbol)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          onChange(e.target.value)
        }}
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        placeholder={placeholder ?? 'Search symbol…'}
        autoComplete="off"
        className={
          className ??
          'w-40 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent'
        }
      />
      {open && (results.length > 0 || loading) && (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-border bg-surface p-1 shadow-lg">
          {loading && <p className="px-2 py-1.5 text-xs text-text-muted">Searching…</p>}
          {!loading &&
            results.map((r) => (
              <button
                key={`${r.symbol}-${r.exchange}`}
                type="button"
                onClick={() => select(r.symbol)}
                className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-bg"
              >
                <span className="text-sm text-text">{r.symbol}</span>
                <span className="truncate text-xs text-text-muted">
                  {r.name}
                  {r.exchange ? ` · ${r.exchange}` : ''}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
