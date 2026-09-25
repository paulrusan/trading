// Shared date/time formatting so the app never shows a bare numeric month
// (e.g. "2026-09-24" or "9/24/2026") — always a word, e.g. "Sep 24, 2026".

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// For plain "YYYY-MM-DD" date-only strings (trade entry/exit dates, equity curve x-axis).
// Parsed manually instead of `new Date(dateStr)`, which reads the string as UTC midnight
// and can render as the previous day in negative-UTC-offset locales.
export function formatDateOnly(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return dateStr
  return `${MONTH_SHORT[m - 1]} ${d}, ${y}`
}

// For "YYYY-MM" month keys (dashboard monthly performance chart).
export function formatMonthOnly(monthStr) {
  if (!monthStr) return ''
  const [y, m] = monthStr.split('-').map(Number)
  if (!y || !m) return monthStr
  return `${MONTH_SHORT[m - 1]} ${y}`
}

// For a real timestamp (ISO string, epoch ms, or Date) where the local calendar date is
// what matters, no time-of-day.
export function formatDate(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// For a real timestamp where both date and local time-of-day matter.
export function formatDateTime(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
