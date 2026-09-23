import { useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi'

export default function Settings() {
  const api = useApi()
  const [hasKey, setHasKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api
      .getSettings()
      .then((data) => setHasKey(data.hasAnthropicApiKey))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setStatus('')
    setSubmitting(true)
    try {
      const data = await api.saveSettings({ anthropicApiKey: apiKey })
      setHasKey(data.hasAnthropicApiKey)
      setApiKey('')
      setStatus('API key saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async () => {
    if (!window.confirm('Remove your saved Anthropic API key?')) return
    setError('')
    setStatus('')
    try {
      await api.deleteSettings()
      setHasKey(false)
      setStatus('API key removed.')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <h1 className="mb-6 text-xl font-semibold text-text">Settings</h1>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="mb-1 font-medium text-text">Anthropic API key</h2>
        <p className="mb-4 text-sm text-text-muted">
          Used by the AI Assistant to analyze your journal and answer your questions. Get a
          key at{' '}
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            console.anthropic.com
          </a>
          . It's stored securely and only used for your own requests.
        </p>

        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <>
            <p className="mb-4 text-sm">
              Status:{' '}
              {hasKey ? (
                <span className="text-profit">Configured</span>
              ) : (
                <span className="text-text-muted">Not configured</span>
              )}
            </p>

            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <input
                type="password"
                placeholder={hasKey ? 'Enter a new key to replace it' : 'sk-ant-…'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-text outline-none focus:border-accent"
              />

              {error && <p className="text-sm text-loss">{error}</p>}
              {status && <p className="text-sm text-profit">{status}</p>}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting || !apiKey}
                  className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : 'Save key'}
                </button>
                {hasKey && (
                  <button
                    type="button"
                    onClick={handleRemove}
                    className="rounded-md border border-border px-4 py-2 text-loss hover:bg-bg"
                  >
                    Remove key
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
