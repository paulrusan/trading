import { useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../hooks/useApi'
import { formatDate } from '../lib/formatDate'

function titleFromContent(content) {
  const firstLine = content.split('\n')[0].trim()
  return firstLine || 'Untitled'
}

export function NotesPanel() {
  const api = useApi()
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [content, setContent] = useState('')
  const lastSaved = useRef('')

  useEffect(() => {
    let cancelled = false
    api
      .getNotes()
      .then((data) => {
        if (cancelled) return
        const sorted = [...data].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        setNotes(sorted)
        if (sorted.length > 0) {
          setSelectedId(sorted[0].id)
          setContent(sorted[0].content)
          lastSaved.current = sorted[0].content
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selected = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId])

  useEffect(() => {
    if (!selected || content === lastSaved.current) return
    const timer = setTimeout(async () => {
      const saved = await api.saveNote({
        ...selected,
        content,
        title: titleFromContent(content),
        updatedAt: new Date().toISOString(),
      })
      lastSaved.current = content
      setNotes((prev) =>
        [...prev.map((n) => (n.id === saved.id ? saved : n))].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        ),
      )
    }, 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, selected])

  const selectNote = (note) => {
    setSelectedId(note.id)
    setContent(note.content)
    lastSaved.current = note.content
  }

  const handleNew = async () => {
    const now = new Date().toISOString()
    const saved = await api.saveNote({ content: '', title: 'Untitled', createdAt: now, updatedAt: now })
    setNotes((prev) => [saved, ...prev])
    setSelectedId(saved.id)
    setContent('')
    lastSaved.current = ''
  }

  const handleDelete = async () => {
    if (!selected) return
    if (!window.confirm('Delete this note?')) return
    await api.deleteNote(selected.id)
    const remaining = notes.filter((n) => n.id !== selected.id)
    setNotes(remaining)
    if (remaining.length > 0) {
      selectNote(remaining[0])
    } else {
      setSelectedId(null)
      setContent('')
      lastSaved.current = ''
    }
  }

  if (loading) {
    return <div className="p-6 text-text-muted">Loading…</div>
  }

  return (
    <div className="flex h-full flex-col sm:flex-row">
      <div className="flex max-h-64 flex-col border-b border-border bg-surface sm:max-h-none sm:w-64 sm:border-b-0 sm:border-r">
        <div className="flex items-center justify-between border-b border-border p-3">
          <h2 className="font-semibold text-text">Notes</h2>
          <button
            type="button"
            onClick={handleNew}
            className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {error && <p className="p-3 text-sm text-loss">{error}</p>}
          {notes.length === 0 && !error && (
            <p className="p-3 text-sm text-text-muted">No notes yet.</p>
          )}
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => selectNote(note)}
              className={`block w-full border-b border-border px-3 py-2 text-left text-sm ${
                note.id === selectedId ? 'bg-bg text-text' : 'text-text-muted hover:bg-bg'
              }`}
            >
              <div className="truncate font-medium">{note.title || 'Untitled'}</div>
              <div className="text-xs text-text-muted">
                {formatDate(note.updatedAt)}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex items-center justify-end border-b border-border p-2">
              <button
                type="button"
                onClick={handleDelete}
                className="text-xs text-loss hover:underline"
              >
                Delete
              </button>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Start typing…"
              className="flex-1 resize-none bg-bg p-4 text-lg text-text outline-none"
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-text-muted">
            Select a note or create a new one.
          </div>
        )}
      </div>
    </div>
  )
}
