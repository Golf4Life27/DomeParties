// Time helpers. Event times are stored as integer minutes from midnight (local
// venue time) on a given calendar date, which keeps availability math simple
// and timezone-free for a single-location venue.

export function minutesToLabel(mins: number): string {
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

/** Format a YYYY-MM-DD date string (no timezone shifting). */
export function formatDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Today's date in YYYY-MM-DD — in the VENUE's timezone (America/Chicago).
 * Servers run UTC; from ~7pm Chicago the UTC date is already tomorrow, which
 * would shift lead-time gates, reminder windows, and "today" views a day early.
 */
export function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}

/** UTC-midnight Date for the venue's current calendar date (how event dates are stored). */
export function todayVenueMidnight(): Date {
  return new Date(`${todayStr()}T00:00:00.000Z`)
}

/** Add days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * Peak = Friday, Saturday, or Sunday (all day), matching the venue's
 * "Mon–Thurs vs Fri–Sunday" pricing on the party cards.
 */
export function isPeakSlot(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=Sun..6=Sat
  return dow === 5 || dow === 6 || dow === 0 // Fri, Sat, Sun
}
