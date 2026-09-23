export function StatTile({ label, value, tone }) {
  const toneClass =
    tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-text'

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-sm text-text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  )
}
