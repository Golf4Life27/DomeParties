import { prisma } from '@/lib/db'

// ---------------------------------------------------------------------------
// Operating-hours resolution.
//
// GOLF hours  = when Trackman is selling bays → the contention window.
// PARTY hours = when we're willing to host events (often wider than golf).
//
// The key consequence: a party that never overlaps golf hours cannot collide
// with a Trackman booking, so it's safe to confirm instantly on any bay —
// no watcher data required. Off-season Mon–Thu (golf closed) is entirely
// uncontested, which is most of the week.
// ---------------------------------------------------------------------------

export type Window = { openMinute: number; closeMinute: number }

function dateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

function dowOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/**
 * Resolve the window for one kind on one date. Seasonal rows (validFrom/To
 * covering the date) beat year-round rows; among seasonal rows the latest
 * validFrom wins. Returns null when closed / no rule applies.
 */
export async function windowFor(dateStr: string, kind: 'GOLF' | 'PARTY'): Promise<Window | null> {
  const date = dateOnly(dateStr)
  const rows = await prisma.operatingHours.findMany({
    where: {
      kind,
      active: true,
      dayOfWeek: dowOf(dateStr),
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: date } }] },
        { OR: [{ validTo: null }, { validTo: { gte: date } }] },
      ],
    },
  })
  if (rows.length === 0) return null

  // Most specific first: seasonal (has validFrom) over year-round, then latest start.
  rows.sort((a, b) => {
    const aSeason = a.validFrom ? 1 : 0
    const bSeason = b.validFrom ? 1 : 0
    if (aSeason !== bSeason) return bSeason - aSeason
    const at = a.validFrom?.getTime() ?? 0
    const bt = b.validFrom?.getTime() ?? 0
    return bt - at
  })
  const best = rows[0]
  if (best.closed || best.closeMinute <= best.openMinute) return null
  return { openMinute: best.openMinute, closeMinute: best.closeMinute }
}

/** Closure intervals for a date (nothing is sellable inside these). */
export async function closuresFor(dateStr: string): Promise<Window[]> {
  const rows = await prisma.closure.findMany({ where: { date: dateOnly(dateStr) } })
  return rows.map((c) => ({ openMinute: c.startMinute, closeMinute: c.endMinute }))
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

export type HoursContext = {
  /** When we may sell parties; null = we don't host that day. */
  party: Window | null
  /** When Trackman sells bays; null = golf closed (no contention at all). */
  golf: Window | null
  closures: Window[]
}

export async function hoursContext(dateStr: string): Promise<HoursContext> {
  const [party, golf, closures] = await Promise.all([
    windowFor(dateStr, 'PARTY'),
    windowFor(dateStr, 'GOLF'),
    closuresFor(dateStr),
  ])
  return { party, golf, closures }
}

/**
 * True when [startMinutes, endMinutes) cannot collide with a Trackman booking
 * because golf is closed then. Such bookings are safe to confirm instantly on
 * any bay — shared or not — with no external availability data.
 */
export function isUncontested(ctx: HoursContext, startMinutes: number, endMinutes: number): boolean {
  if (!ctx.golf) return true // golf closed all day → zero contention
  return !overlaps(startMinutes, endMinutes, ctx.golf.openMinute, ctx.golf.closeMinute)
}

/** True when the window sits inside party hours and clear of every closure. */
export function isSellable(ctx: HoursContext, startMinutes: number, endMinutes: number): boolean {
  if (!ctx.party) return false
  if (startMinutes < ctx.party.openMinute || endMinutes > ctx.party.closeMinute) return false
  return !ctx.closures.some((c) => overlaps(startMinutes, endMinutes, c.openMinute, c.closeMinute))
}

/** Human summary for admin/staff surfaces. */
export function describeWindow(w: Window | null): string {
  if (!w) return 'Closed'
  const fmt = (m: number) => {
    const h24 = Math.floor(m / 60)
    const mm = m % 60
    const ampm = h24 >= 12 ? 'PM' : 'AM'
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12
    return `${h12}${mm ? ':' + String(mm).padStart(2, '0') : ''}${ampm.toLowerCase()}`
  }
  return `${fmt(w.openMinute)}–${fmt(w.closeMinute)}`
}
