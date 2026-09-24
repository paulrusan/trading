import { useCallback, useState } from 'react'
import { useAuth } from '../context/AuthContext'

const API_BASE = import.meta.env.VITE_API_URL

async function request(path, options, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }

  if (res.status === 204) return null
  return res.json()
}

export function useApi() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const call = useCallback(
    async (path, options) => {
      if (!user) throw new Error('Not authenticated')
      setLoading(true)
      setError(null)
      try {
        const token = await user.getIdToken()
        return await request(path, options, token)
      } catch (err) {
        setError(err.message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [user],
  )

  const getTrades = useCallback(() => call('/trades', { method: 'GET' }), [call])
  const saveTrade = useCallback(
    (trade) => call('/trades', { method: 'POST', body: JSON.stringify(trade) }),
    [call],
  )
  const deleteTrade = useCallback((id) => call(`/trades/${id}`, { method: 'DELETE' }), [call])

  const getIdeas = useCallback(() => call('/ideas', { method: 'GET' }), [call])
  const saveIdea = useCallback(
    (idea) => call('/ideas', { method: 'POST', body: JSON.stringify(idea) }),
    [call],
  )
  const deleteIdea = useCallback((id) => call(`/ideas/${id}`, { method: 'DELETE' }), [call])

  const getNotes = useCallback(() => call('/notes', { method: 'GET' }), [call])
  const saveNote = useCallback(
    (note) => call('/notes', { method: 'POST', body: JSON.stringify(note) }),
    [call],
  )
  const deleteNote = useCallback((id) => call(`/notes/${id}`, { method: 'DELETE' }), [call])

  const getSettings = useCallback(() => call('/settings', { method: 'GET' }), [call])
  const saveSettings = useCallback(
    (settings) => call('/settings', { method: 'POST', body: JSON.stringify(settings) }),
    [call],
  )
  const deleteSettings = useCallback(() => call('/settings', { method: 'DELETE' }), [call])

  const askAssistant = useCallback(
    (message, context, history) =>
      call('/assistant', { method: 'POST', body: JSON.stringify({ message, context, history }) }),
    [call],
  )

  const getMarketData = useCallback(
    (symbol, interval = '1day', outputsize = 5000, source = 'twelvedata') =>
      call(
        `/market-data?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=${outputsize}&source=${encodeURIComponent(source)}`,
        { method: 'GET' },
      ),
    [call],
  )

  const searchSymbols = useCallback(
    (query, source = 'twelvedata') =>
      call(
        `/symbol-search?query=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}`,
        { method: 'GET' },
      ),
    [call],
  )

  const getAlerts = useCallback(() => call('/alerts', { method: 'GET' }), [call])
  const saveAlert = useCallback(
    (alert) => call('/alerts', { method: 'POST', body: JSON.stringify(alert) }),
    [call],
  )
  const deleteAlert = useCallback((id) => call(`/alerts/${id}`, { method: 'DELETE' }), [call])
  const runAlertsCheck = useCallback(() => call('/alerts/run', { method: 'POST' }), [call])

  const getWatchlist = useCallback(() => call('/watchlist', { method: 'GET' }), [call])
  const saveWatchlistEntry = useCallback(
    (entry) => call('/watchlist', { method: 'POST', body: JSON.stringify(entry) }),
    [call],
  )
  const deleteWatchlistEntry = useCallback(
    (id) => call(`/watchlist/${id}`, { method: 'DELETE' }),
    [call],
  )
  const runSnapshotsCheck = useCallback(() => call('/snapshots/run', { method: 'POST' }), [call])
  const runSnapshotBackfill = useCallback(
    (symbol, dataSource, interval) =>
      call('/snapshots/backfill', { method: 'POST', body: JSON.stringify({ symbol, dataSource, interval }) }),
    [call],
  )

  const getSnapshots = useCallback(
    (symbol, dataSource = 'twelvedata', interval = '1day', limit = 50) =>
      call(
        `/snapshots?symbol=${encodeURIComponent(symbol)}&dataSource=${encodeURIComponent(dataSource)}&interval=${encodeURIComponent(interval)}&limit=${limit}`,
        { method: 'GET' },
      ),
    [call],
  )
  const getTrends = useCallback(
    (symbol, dataSource = 'twelvedata', interval = '1day', limit = 20) =>
      call(
        `/trends?symbol=${encodeURIComponent(symbol)}&dataSource=${encodeURIComponent(dataSource)}&interval=${encodeURIComponent(interval)}&limit=${limit}`,
        { method: 'GET' },
      ),
    [call],
  )

  return {
    loading,
    error,
    getTrades,
    saveTrade,
    deleteTrade,
    getIdeas,
    saveIdea,
    deleteIdea,
    getNotes,
    saveNote,
    deleteNote,
    getSettings,
    saveSettings,
    deleteSettings,
    askAssistant,
    getMarketData,
    searchSymbols,
    getAlerts,
    saveAlert,
    deleteAlert,
    runAlertsCheck,
    getWatchlist,
    saveWatchlistEntry,
    deleteWatchlistEntry,
    runSnapshotsCheck,
    runSnapshotBackfill,
    getSnapshots,
    getTrends,
  }
}
