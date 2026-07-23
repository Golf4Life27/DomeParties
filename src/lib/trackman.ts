import { prisma } from '@/lib/db'
import { minutesToLabel } from '@/lib/time'
import { notifyStaff } from '@/lib/booking'

// ---------------------------------------------------------------------------
// Trackman coexistence — capacity-based conflict detection.
//
// Our bookings and Trackman share one pool of physical bays with NO integration.
// The reliable conflict signal is capacity: at any moment, if
//   (bays our confirmed bookings need) + (bays Trackman has busy) > total bays,
// somebody is double-booked. Specific bay-number matching is unreliable (the two
// systems label bays independently), so we detect over-subscription instead.
// Data source is pluggable: manual paste today, scraper/API later.
// ---------------------------------------------------------------------------

export type ParsedReservation = { startMinutes: number; endMinutes: number; bayCount: number; label?: string }

function parseTime(raw: string): number | null {
  const s = raw.trim().toLowerCase()
  // 12-hour: "1:30 pm", "1 pm", "11am"
  const m12 = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(s)
  if (m12) {
    let h = parseInt(m12[1], 10) % 12
    if (m12[3] === 'pm') h += 12
    return h * 60 + (m12[2] ? parseInt(m12[2], 10) : 0)
  }
  // 24-hour: "13:30", "9:00"
  const m24 = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (m24) {
    const h = parseInt(m24[1], 10)
    const min = parseInt(m24[2], 10)
    if (h <= 24 && min < 60) return h * 60 + min
  }
  return null
}

/**
 * Parse pasted Trackman rows. One reservation per line:
 *   1:30 PM - 3:30 PM            → 1 bay that window
 *   1:30 PM - 3:30 PM x12        → 12 bays busy that window (summary style)
 *   13:30-15:30 x4 Corporate     → 4 bays, labeled
 * Blank lines and unparseable lines are skipped (returned in `skipped`).
 */
export function parseReservations(text: string): { rows: ParsedReservation[]; skipped: string[] } {
  const rows: ParsedReservation[] = []
  const skipped: string[] = []
  for (const line of text.split('\n')) {
    const raw = line.trim()
    if (!raw) continue
    // pull an optional "xN" multiplier anywhere in the line
    const xMatch = /\bx\s*(\d{1,3})\b/i.exec(raw)
    const bayCount = xMatch ? Math.max(1, parseInt(xMatch[1], 10)) : 1
    const cleaned = raw.replace(/\bx\s*\d{1,3}\b/i, ' ')
    const range = /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i.exec(cleaned)
    if (!range) {
      skipped.push(raw)
      continue
    }
    const start = parseTime(range[1])
    const end = parseTime(range[2])
    if (start === null || end === null || end <= start) {
      skipped.push(raw)
      continue
    }
    const label = cleaned.slice(range.index + range[0].length).trim() || undefined
    rows.push({ startMinutes: start, endMinutes: end, bayCount, label })
  }
  return { rows, skipped }
}

function dateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

/** Replace all external reservations for a date with a fresh set. */
export async function ingestExternalReservations(dateStr: string, rows: ParsedReservation[], source = 'trackman') {
  const date = dateOnly(dateStr)
  await prisma.$transaction([
    prisma.externalReservation.deleteMany({ where: { date, source } }),
    prisma.externalReservation.createMany({
      data: rows.map((r) => ({
        source,
        date,
        startMinutes: r.startMinutes,
        endMinutes: r.endMinutes,
        bayCount: r.bayCount,
        label: r.label ?? null,
      })),
    }),
  ])
  return { imported: rows.length }
}

export type ConflictWindow = {
  startMinutes: number
  endMinutes: number
  demand: number
  capacity: number
  ourBookings: { reference: string; bays: number }[]
}

/** Total physical bays (active BAY resources). */
async function bayCapacity(): Promise<number> {
  return prisma.resource.count({ where: { type: 'BAY', active: true } })
}

/**
 * Sweep-line capacity check for one date. Returns the windows where our
 * confirmed/paid demand + Trackman demand exceeds physical bays.
 */
export async function scanDate(dateStr: string): Promise<ConflictWindow[]> {
  const date = dateOnly(dateStr)
  const capacity = await bayCapacity()

  const [ours, external] = await Promise.all([
    prisma.booking.findMany({
      where: {
        date,
        OR: [{ status: 'CONFIRMED' }, { status: 'PENDING', depositPaid: true }],
      },
      select: { reference: true, startMinutes: true, endMinutes: true, baysNeeded: true },
    }),
    prisma.externalReservation.findMany({
      where: { date },
      select: { startMinutes: true, endMinutes: true, bayCount: true },
    }),
  ])

  // Boundary points where demand can change.
  const points = new Set<number>()
  for (const b of ours) {
    points.add(b.startMinutes)
    points.add(b.endMinutes)
  }
  for (const e of external) {
    points.add(e.startMinutes)
    points.add(e.endMinutes)
  }
  const sorted = [...points].sort((a, b) => a - b)

  const windows: ConflictWindow[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const t = sorted[i]
    const next = sorted[i + 1]
    const mid = (t + next) / 2 // sample the middle of the sub-interval
    const activeOurs = ours.filter((b) => b.startMinutes <= mid && mid < b.endMinutes)
    const ourDemand = activeOurs.reduce((s, b) => s + b.baysNeeded, 0)
    const extDemand = external
      .filter((e) => e.startMinutes <= mid && mid < e.endMinutes)
      .reduce((s, e) => s + e.bayCount, 0)
    const demand = ourDemand + extDemand
    if (demand > capacity) {
      // merge with the previous window if contiguous & same demand set
      const prev = windows[windows.length - 1]
      if (prev && prev.endMinutes === t && prev.demand === demand) {
        prev.endMinutes = next
      } else {
        windows.push({
          startMinutes: t,
          endMinutes: next,
          demand,
          capacity,
          ourBookings: activeOurs.map((b) => ({ reference: b.reference, bays: b.baysNeeded })),
        })
      }
    }
  }
  return windows
}

function signatureFor(dateStr: string, w: ConflictWindow): string {
  const refs = w.ourBookings.map((b) => b.reference).sort().join(',')
  return `${dateStr}|${w.startMinutes}-${w.endMinutes}|${w.demand}|${refs}`
}

/**
 * Scan the upcoming window (default 120 days) for conflicts and alert staff on
 * NEW ones only (deduped by signature). Resolves alerts that no longer apply.
 * Returns the currently-active conflicts.
 */
export async function scanConflictsAndAlert(days = 120): Promise<{ active: number; newlyAlerted: number }> {
  const today = new Date()
  const todayMid = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const horizon = new Date(todayMid.getTime() + days * 86_400_000)

  // Only dates that actually have external data are worth scanning.
  const dates = await prisma.externalReservation.findMany({
    where: { date: { gte: todayMid, lte: horizon } },
    distinct: ['date'],
    select: { date: true },
  })

  const currentSignatures = new Set<string>()
  let newlyAlerted = 0
  let active = 0

  for (const { date } of dates) {
    const dateStr = date.toISOString().slice(0, 10)
    const windows = await scanDate(dateStr)
    for (const w of windows) {
      active += 1
      const sig = signatureFor(dateStr, w)
      currentSignatures.add(sig)
      const detail = `${dateStr} ${minutesToLabel(w.startMinutes)}–${minutesToLabel(w.endMinutes)}: ${w.demand} bays needed vs ${w.capacity} available. Your booking(s): ${w.ourBookings.map((b) => `${b.reference} (${b.bays})`).join(', ') || 'none'}.`
      const existing = await prisma.conflictAlert.findUnique({ where: { signature: sig } })
      if (existing && !existing.resolvedAt) continue // already alerted, still open
      await prisma.conflictAlert.upsert({
        where: { signature: sig },
        create: { signature: sig, dateStr, detail },
        update: { detail, notifiedAt: new Date(), resolvedAt: null },
      })
      newlyAlerted += 1
      await notifyStaff({
        title: `Possible Trackman conflict — ${dateStr}`,
        lines: [
          detail,
          'This system + Trackman are trying to use more bays than exist in that window.',
          'Check Trackman and re-slot one side before the event.',
        ],
        adminPath: `/admin/day?date=${dateStr}`,
        urgent: true,
      })
    }
  }

  // Auto-resolve alerts whose conflict is gone (data updated / booking cancelled).
  await prisma.conflictAlert.updateMany({
    where: { resolvedAt: null, signature: { notIn: [...currentSignatures] } },
    data: { resolvedAt: new Date() },
  })

  return { active, newlyAlerted }
}
