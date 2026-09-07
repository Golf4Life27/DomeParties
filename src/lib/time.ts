// Time helpers. Event times are stored as integer minutes from midnight (local
// venue time) on a given calendar date, which keeps availability math simple
// and timezone-free for a single-location venue.

export function minutesToLabel(mins: number): string {
  // After-hours events run past midnight, so minutes can exceed 1440 — an
  // 8pm–2am Saturday party ends at 1560. Without the wrap, 1440 rendered as
  // "12:00 PM" and 1560 as "2:00 PM", i.e. a customer was shown a party running
  // "8:00 PM – 2:00 PM". Fold into the day before formatting; the next-day part
  // is implied by the event's date and is spelled out where it matters.
  const h24 = Math.floor(mins / 60) % 24
  const m = mins % 60
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

/** True when a time lands on the calendar day after the event's own date. */
export function isNextDay(mins: number): boolean {
  return mins >= 1440
}

/** Label that says out loud when a time is past midnight: "1:00 AM (next day)". */
export function minutesToLabelWithDay(mins: number): string {
  return isNextDay(mins) ? `${minutesToLabel(mins)} (next day)` : minutesToLabel(mins)
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
