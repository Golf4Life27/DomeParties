import { prisma } from '@/lib/db'
import { minutesToLabel, isPeakSlot, todayStr, addDays } from '@/lib/time'
import { hoursContext, isSellable, isUncontested } from '@/lib/hours'
import type { TimeSlot } from '@/lib/types'

/**
 * Pluggable availability. Phase 1 ships the InternalAvailabilityProvider
 * (our own managed calendar). A Trackman / Google Calendar adapter can be
 * dropped in later behind this same interface without touching callers.
 */
export interface AvailabilityProvider {
  /** Bookable start slots for a date, given how many bays and how long. */
  getSlots(dateStr: string, baysNeeded: number, durationMinutes: number): Promise<TimeSlot[]>
  /**
   * Pick concrete bay resource IDs for a window, preferring Exclusive bays.
   * Returns the chosen IDs and whether any Shared bay was used (→ staff review),
   * or null if not enough bays are free.
   */
  assignBays(
    dateStr: string,
    startMinutes: number,
    endMinutes: number,
    baysNeeded: number,
    excludeBookingId?: string,
  ): Promise<{ resourceIds: string[]; usedShared: boolean; uncontested: boolean } | null>
}

const SLOT_STEP = 30 // minutes between candidate start times

type BusyInterval = { start: number; end: number; resourceIds: string[] }

async function loadDay(dateStr: string, excludeBookingId?: string) {
  const [setting, bays, bookings] = await Promise.all([
    prisma.setting.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.resource.findMany({
      where: { type: 'BAY', active: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.booking.findMany({
      where: {
        date: new Date(`${dateStr}T00:00:00.000Z`),
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
        OR: [
          { status: 'CONFIRMED' },
          // PENDING blocks bays only while its hold is alive: deposit paid,
          // staff-managed (no expiry, e.g. quotes), or not yet expired.
          {
            status: 'PENDING',
            OR: [
              { depositPaid: true },
              { holdExpiresAt: null },
              { holdExpiresAt: { gt: new Date() } },
            ],
          },
        ],
      },
      include: { resources: true },
    }),
  ])
  const intervals: BusyInterval[] = bookings.map((b) => ({
    start: b.startMinutes,
    end: b.endMinutes,
    resourceIds: b.resources.map((r) => r.resourceId),
  }))
  return { setting, bays, intervals }
}

/** Has the owner configured any real hours yet? (Legacy fallback guard.) */
async function hasAnyHours(): Promise<boolean> {
  return (await prisma.operatingHours.count({ where: { active: true, kind: 'PARTY' } })) > 0
}

/** True if two intervals come within `buffer` minutes of each other. */
function tooClose(aStart: number, aEnd: number, bStart: number, bEnd: number, buffer: number) {
  return aStart < bEnd + buffer && bStart < aEnd + buffer
}

class InternalAvailabilityProvider implements AvailabilityProvider {
  async getSlots(dateStr: string, baysNeeded: number, durationMinutes: number): Promise<TimeSlot[]> {
    // Enforce online lead time.
    const earliest = addDays(todayStr(), 0)
    if (dateStr < earliest) return []

    const { setting, bays, intervals } = await loadDay(dateStr)
    const minDate = addDays(todayStr(), setting.leadTimeDaysOnline)
    if (dateStr < minDate) return []

    // Real per-day hours: sell only inside PARTY hours, never inside a closure.
    // Falls back to the legacy global window when no hours are configured.
    const ctx = await hoursContext(dateStr)
    const open = ctx.party ? ctx.party.openMinute : setting.openHour * 60
    const close = ctx.party ? ctx.party.closeMinute : setting.closeHour * 60
    const hoursConfigured = ctx.party !== null || (await hasAnyHours())
    if (hoursConfigured && !ctx.party) return [] // we don't host events this day

    const buffer = setting.bufferMinutes
    const totalBays = bays.length
    const slots: TimeSlot[] = []

    for (let start = open; start + durationMinutes <= close; start += SLOT_STEP) {
      const end = start + durationMinutes
      if (ctx.party && !isSellable(ctx, start, end)) continue // closure or outside party hours
      // Count bays made busy by an existing booking that conflicts with this window.
      const busyBayIds = new Set<string>()
      for (const iv of intervals) {
        if (tooClose(start, end, iv.start, iv.end, buffer)) {
          for (const rid of iv.resourceIds) busyBayIds.add(rid)
        }
      }
      const availableBays = totalBays - busyBayIds.size
      if (availableBays >= baysNeeded) {
        slots.push({
          startMinutes: start,
          endMinutes: end,
          label: minutesToLabel(start),
          availableBays,
          peak: isPeakSlot(dateStr),
          uncontested: isUncontested(ctx, start, end),
        })
      }
    }
    return slots
  }

  async assignBays(
    dateStr: string,
    startMinutes: number,
    endMinutes: number,
    baysNeeded: number,
    excludeBookingId?: string,
  ): Promise<{ resourceIds: string[]; usedShared: boolean; uncontested: boolean } | null> {
    const { setting, bays, intervals } = await loadDay(dateStr, excludeBookingId)
    const buffer = setting.bufferMinutes
    const busyBayIds = new Set<string>()
    for (const iv of intervals) {
      if (tooClose(startMinutes, endMinutes, iv.start, iv.end, buffer)) {
        for (const rid of iv.resourceIds) busyBayIds.add(rid)
      }
    }
    const free = bays.filter((b) => !busyBayIds.has(b.id))
    if (free.length < baysNeeded) return null
    // Prefer Exclusive bays (instant-confirmable), then Shared (needs review).
    const ordered = [...free].sort((a, b) =>
      a.exclusive === b.exclusive ? a.sortOrder - b.sortOrder : a.exclusive ? -1 : 1,
    )
    const chosen = ordered.slice(0, baysNeeded)
    // A window that never overlaps golf hours can't collide with Trackman, so
    // shared bays are safe there — that's what makes off-season Mon–Thu (golf
    // closed) instantly confirmable across all 30 bays.
    const ctx = await hoursContext(dateStr)
    const uncontested = isUncontested(ctx, startMinutes, endMinutes)
    return {
      resourceIds: chosen.map((b) => b.id),
      usedShared: chosen.some((b) => !b.exclusive),
      uncontested,
    }
  }
}

export const availability: AvailabilityProvider = new InternalAvailabilityProvider()
