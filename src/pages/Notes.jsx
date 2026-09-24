import { useState } from 'react'
import { IdeasPanel } from '../components/IdeasPanel'
import { NotesPanel } from '../components/NotesPanel'

const TABS = [
  { key: 'notes', label: 'Notes' },
  { key: 'ideas', label: 'Trade ideas' },
]

export default function Notes() {
  const [tab, setTab] = useState('notes')

  return (
    <div className="flex h-[calc(100svh-57px)] flex-col">
      <div className="flex gap-1 border-b border-border bg-surface px-4 pt-2 sm:px-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-t-md px-3 py-2 text-sm font-medium ${
              tab === t.key
                ? 'border-b-2 border-accent text-text'
                : 'text-text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">{tab === 'notes' ? <NotesPanel /> : <IdeasPanel />}</div>
    </div>
  )
}
