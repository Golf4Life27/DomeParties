import { ingestExternalReservations, type ParsedReservation } from '@/lib/trackman'
import { prisma } from '@/lib/db'
import { todayStr, addDays } from '@/lib/time'

// ---------------------------------------------------------------------------
// Your Golf Booking (Trackman) — live bay occupancy, pulled straight from the
// venue's public bookings feed.
//
// This replaces the manual paste. The vendor has no maintained public API and
// recommends their Purchase Update webhook, but for OUR question — "how many
// bays are already spoken for at 7pm on the 14th?" — the anonymous public feed
// is strictly better:
//
//   * It is a snapshot of current truth, so re-reading a date is idempotent and
//     matches the delete-then-insert ingest we already have. A webhook is a
//     stream of deltas: miss one, replay one out of order, or take a deploy
//     mid-flight and the local picture silently drifts from reality.
//   * It backfills. Webhooks only ever tell you about the future; every booking
//     Trackman already holds for this winter would be invisible.
//   * It needs no endpoint of our own. The webhook has no documented signature
//     scheme, so consuming it would mean standing up an unauthenticated public
//     route that writes into the table our conflict alerts read from — anyone
//     who found it could invent reservations and bury staff in false alarms.
//
// The webhook stays the right tool the day we want purchase/revenue data, which
// the public feed does not carry. It is not the right tool for capacity.
//
// Feed shape (verified against live data for a busy Saturday):
//   { id, start, end, status, type, bayId, bayRef, bayOptionId, rangeId,
//     playerOptions: [{ quantity, purchaseOptionId }] }
// `start`/`end` are real UTC instants; `bayRef` is the human bay number and maps
// 1:1 onto our Resource names ("1".."30" plus "S1"/"S2" for the simulators).
// ---------------------------------------------------------------------------

const YGB_BASE = 'https://api.yourgolfbooking.com'
const VENUE_SLUG = process.env.YGB_VENUE_SLUG || 'whitetail'
const VENUE_TZ = 'America/Chicago'

/** Source tag on ExternalReservation rows written by this puller. */
export const YGB_SOURCE = 'trackman'

/**
 * Statuses that mean the bay is NOT held. Everything else counts as occupied.
 *
 * A denylist, not an allowlist, on purpose: the live feed shows `attended` and
 * `confirmed` today, but an unrecognised future status must fall on the side of
 * "this bay is busy". Under-counting external demand hides a real double
 * booking; over-counting only produces an alert a human can dismiss.
 */
const FREE_STATUSES = new Set(['cancelled', 'canceled', 'voided', 'void', 'refunded', 'draft'])

type YgbBooking = {
  id?: number
  start?: string
  end?: string
  status?: string
  type?: string
  bayId?: number
  bayRef?: string
}

/** Wall-clock date + minutes-from-midnight for an instant, in venue time. */
function venueParts(iso: string): { dateStr: string; minutes: number } | null {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: VENUE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(fmt.formatToParts(new Date(t)).map((p) => [p.type, p.value]))
  const { year, month, day, hour, minute } = parts
  if (!year || !month || !day || hour === undefined || minute === undefined) return null
  return { dateStr: `${year}-${month}-${day}`, minutes: parseInt(hour, 10) * 60 + parseInt(minute, 10) }
}

/**
 * The UTC instant of local midnight starting `dateStr`.
 *
 * The offset is probed at local noon rather than at midnight so the lookup can't
 * land inside the 2am DST transition, where the offset is ambiguous. Callers pad
 * the query window anyway and re-filter by each booking's own local date, so an
 * hour of slack on the two DST days a year changes nothing.
 */
function venueMidnightUtc(dateStr: string): number {
  const naiveNoon = Date.parse(`${dateStr}T12:00:00Z`)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: VENUE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const p = Object.fromEntries(fmt.formatToParts(new Date(naiveNoon)).map((x) => [x.type, x.value]))
  const asIfUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  )
  const offsetMs = asIfUtc - naiveNoon // negative west of Greenwich
  return Date.parse(`${dateStr}T00:00:00Z`) - offsetMs
}

/**
 * Turn one day's raw feed rows into reservations for the venue day `dateStr`.
 * Exported for testing — this is where every timezone and edge-case decision
 * lives, and it is pure.
 */
export function normalizeDay(
  rows: YgbBooking[],
  dateStr: string,
): { reservations: ParsedReservation[]; skipped: number; simulators: number } {
  const reservations: ParsedReservation[] = []
  let skipped = 0
  let simulators = 0

  for (const r of rows) {
    if (r.type && r.type !== 'bay') {
      skipped += 1
      continue
    }
    if (r.status && FREE_STATUSES.has(r.status.toLowerCase())) continue
    if (!r.start || !r.end) {
      skipped += 1
      continue
    }
    // Simulator bays ("S1"/"S2") are excluded: bayCapacity() counts only BAY
    // resources (30 of them), so simulator demand measured against a 30-bay
    // ceiling would manufacture conflicts out of nothing.
    if (r.bayRef && !/^\d+$/.test(r.bayRef)) {
      simulators += 1
      continue
    }

    const s = venueParts(r.start)
    const e = venueParts(r.end)
    if (!s || !e) {
      skipped += 1
      continue
    }
    // The query window is padded past both ends of the venue day, so rows that
    // belong to the neighbouring day come back too. Keep only this day's.
    if (s.dateStr !== dateStr) continue

    // A booking running past local midnight is clamped to end-of-day: our own
    // bookings are stored as minutes within a single date, and the capacity
    // sweep can only compare the two on the same axis.
    const endMinutes = e.dateStr === dateStr ? e.minutes : 1440
    if (endMinutes <= s.minutes) {
      skipped += 1
      continue
    }

    reservations.push({
      startMinutes: s.minutes,
      endMinutes,
      bayCount: 1,
      label: r.bayRef ? `Bay ${r.bayRef}` : undefined,
    })
  }

  return { reservations, skipped, simulators }
}

/** Fetch one venue day from the public feed. Throws on transport/HTTP failure. */
export async function fetchVenueDay(dateStr: string): Promise<YgbBooking[]> {
  // The feed's start_gte/start_lte are UTC, so a venue day is NOT a UTC day —
  // querying midnight-to-midnight UTC returns 6pm-to-6pm local and quietly drops
  // the whole evening, which is when this building is busiest. Pad two hours
  // past each end of the real local day; normalizeDay filters by local date.
  const from = new Date(venueMidnightUtc(dateStr) - 2 * 3_600_000).toISOString()
  const to = new Date(venueMidnightUtc(addDays(dateStr, 1)) + 2 * 3_600_000).toISOString()
  const url =
    `${YGB_BASE}/venue/${encodeURIComponent(VENUE_SLUG)}/bookings/public` +
    `?start_gte=${encodeURIComponent(from)}&start_lte=${encodeURIComponent(to)}`

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    // Pinned rather than inherited: a cached capacity read is a wrong capacity
    // read, and this runs from a cron where a stale hit would be invisible.
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`YGB ${res.status} for ${dateStr}`)
  const body: unknown = await res.json()
  if (!Array.isArray(body)) throw new Error(`YGB returned non-array for ${dateStr}`)
  return body as YgbBooking[]
}

/**
 * Pull Trackman occupancy for the dates that can actually conflict.
 *
 * Only dates where we hold a confirmed (or deposit-paid) booking are fetched.
 * That isn't just a saving — a conflict requires our demand plus theirs to
 * exceed the bay count, and theirs alone is drawn from the same 30 bays, so a
 * date with no event of ours cannot conflict by definition. In practice this is
 * a few dozen requests a day instead of one per day of the horizon.
 */
export async function syncExternalReservations(
  days = 120,
): Promise<{ ygbDates: number; ygbRows: number; ygbFailed: number }> {
  const today = todayStr()
  const horizon = addDays(today, days)

  const rows = await prisma.booking.findMany({
    where: {
      date: { gte: new Date(`${today}T00:00:00.000Z`), lte: new Date(`${horizon}T00:00:00.000Z`) },
      OR: [{ status: 'CONFIRMED' }, { status: 'PENDING', depositPaid: true }],
    },
    distinct: ['date'],
    select: { date: true },
    orderBy: { date: 'asc' },
    take: 60,
  })

  let ygbRows = 0
  let ygbFailed = 0

  for (const { date } of rows) {
    const dateStr = date.toISOString().slice(0, 10)
    try {
      const raw = await fetchVenueDay(dateStr)
      const { reservations } = normalizeDay(raw, dateStr)
      await ingestExternalReservations(dateStr, reservations, YGB_SOURCE)
      ygbRows += reservations.length
    } catch (e) {
      // One bad day must not stop the sweep, and must never fail the cron —
      // but it does need to be visible, because a silently empty feed reads as
      // "Trackman has nothing booked", which is the most dangerous wrong answer
      // this system can give.
      ygbFailed += 1
      console.error(`[ygb] sync failed for ${dateStr}:`, e)
    }
  }

  return { ygbDates: rows.length, ygbRows, ygbFailed }
}
