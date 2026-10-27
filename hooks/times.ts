// Times as the panel and the lead duck's notes write them.

// A helper's time on its one-line row: 45s, 13m, 1h 05m.
// Under a minute it counts in 5 s steps, so a busy panel redraws for its clocks every 5 s, not every
// second.
export function shortTime(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${Math.floor(seconds / 5) * 5}s`
  const minutes = Math.floor(seconds / 60)

  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

export function dayOf(at: number): string {
  const d = new Date(at)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const clockAt = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
// Time of day, with the weekday when it is a day or more away.
export const whenAt = (ms: number, now: number) => (ms - now > 20 * 3600000 ? new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : clockAt(ms))
