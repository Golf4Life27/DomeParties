import { prisma } from '@/lib/db'
import { minutesToLabel, isPeakSlot, todayStr, addDays } from '@/lib/time'
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
   * Pick concrete bay resource IDs for a window, or null if not enough are free.
   * Used to place a hold at booking time.
   */
  assignBays(
    dateStr: string,
    startMinutes: number,
    endMinutes: number,
    baysNeeded: number,
    excludeBookingId?: string,
  ): Promise<string[] | null>
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
        status: { in: ['PENDING', 'CONFIRMED'] },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
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

    const open = setting.openHour * 60
    const close = setting.closeHour * 60
    const buffer = setting.bufferMinutes
    const totalBays = bays.length
    const slots: TimeSlot[] = []

    for (let start = open; start + durationMinutes <= close; start += SLOT_STEP) {
      const end = start + durationMinutes
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
          peak: isPeakSlot(dateStr, start),
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
  ): Promise<string[] | null> {
    const { setting, bays, intervals } = await loadDay(dateStr, excludeBookingId)
    const buffer = setting.bufferMinutes
    const busyBayIds = new Set<string>()
    for (const iv of intervals) {
      if (tooClose(startMinutes, endMinutes, iv.start, iv.end, buffer)) {
        for (const rid of iv.resourceIds) busyBayIds.add(rid)
      }
    }
    const free = bays.filter((b) => !busyBayIds.has(b.id)).map((b) => b.id)
    if (free.length < baysNeeded) return null
    return free.slice(0, baysNeeded)
  }
}

export const availability: AvailabilityProvider = new InternalAvailabilityProvider()
