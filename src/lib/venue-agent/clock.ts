import { WEEKDAYS, type VenueProfile, type Weekday } from './profile'

// Dates here are calendar dates (YYYY-MM-DD) at the venue. A calendar date's
// weekday is the same everywhere, so only "what is today" needs the time zone.

export function todayIn(timeZone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split('-').map(Number)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function isRealDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && addDays(date, 0) === date
}

/** "Saturday, November 7, 2026" in the venue's own language. */
export function formatDate(p: Pick<VenueProfile, 'locale'>, date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(p.locale, {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** "6:00 PM" or "18:00", as the venue's locale writes it. */
export function formatTime(p: Pick<VenueProfile, 'locale'>, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return new Intl.DateTimeFormat(p.locale, { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' }).format(
    new Date(Date.UTC(2000, 0, 1, h, m)),
  )
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export type DayHours = {
  date: string
  weekday: Weekday
  closed: boolean
  note: string | null
  windows: { open: string; close: string; closesNextDay: boolean }[]
}

export function hoursOn(p: VenueProfile, date: string): DayHours {
  const weekday = weekdayOf(date)
  const closure = p.closures.find((c) => c.date === date)
  if (closure) return { date, weekday, closed: true, note: closure.note || 'Closed', windows: [] }
  const windows = (p.hours[weekday] ?? []).map((w) => ({
    open: w.open,
    close: w.close,
    closesNextDay: toMinutes(w.close) <= toMinutes(w.open),
  }))
  return { date, weekday, closed: windows.length === 0, note: null, windows }
}

/** Does a party of this length fit inside an opening window when it starts at this time? */
export function fitsHours(p: VenueProfile, date: string, start: string, minutes: number): boolean {
  const s = toMinutes(start)
  return hoursOn(p, date).windows.some((w) => {
    const open = toMinutes(w.open)
    const close = toMinutes(w.close) + (w.closesNextDay ? 24 * 60 : 0)
    return s >= open && s + minutes <= close
  })
}

export function isPeak(p: VenueProfile, date: string, start: string | null): boolean {
  const day = weekdayOf(date)
  if (p.peak.allDay.includes(day)) return true
  if (!p.peak.days.includes(day)) return false
  if (!p.peak.from || !start) return true
  return toMinutes(start) >= toMinutes(p.peak.from)
}
