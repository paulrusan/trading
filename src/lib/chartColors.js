import { useEffect, useState } from 'react'

export function usePrefersDark() {
  const [isDark, setIsDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => setIsDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isDark
}

const DARK = {
  accent: '#3b82f6',
  profit: '#22c55e',
  loss: '#ef4444',
  text: '#e5e7eb',
  textMuted: '#94a3b8',
  grid: '#232f47',
  surface: '#111a2e',
}

const LIGHT = {
  accent: '#2563eb',
  profit: '#16a34a',
  loss: '#dc2626',
  text: '#0f172a',
  textMuted: '#64748b',
  grid: '#e2e8f0',
  surface: '#ffffff',
}

export function getChartColors(isDark) {
  return isDark ? DARK : LIGHT
}

// '#22c55e' + 0.3 -> 'rgba(34, 197, 94, 0.3)' — for series fills (e.g. BaselineSeries).
export function withAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
