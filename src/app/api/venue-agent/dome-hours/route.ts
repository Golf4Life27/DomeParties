import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isPreview, venueProductOn } from '@/lib/venue-agent/gate'

// GET /api/venue-agent/dome-hours. Preview copies only. Counts when the dome's
// own party inquiries and confirmed bookings arrived, by time of day in the
// dome's time zone, to measure how much comes in while staff are off. Returns
// counts only: no names, emails or messages ever leave the database.
export const dynamic = 'force-dynamic'

const TZ = 'America/Chicago'
type Bucket = 'weekday_9_to_5' | 'weekday_5_to_10pm' | 'overnight_10pm_to_9am' | 'weekend'

function bucket(d: Date): Bucket {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(d)
  const day = parts.find((p) => p.type === 'weekday')!.value
  const hour = Number(parts.find((p) => p.type === 'hour')!.value)
  if (hour >= 22 || hour < 9) return 'overnight_10pm_to_9am'
  if (day === 'Sat' || day === 'Sun') return 'weekend'
  return hour < 17 ? 'weekday_9_to_5' : 'weekday_5_to_10pm'
}

function tally(dates: Date[]) {
  const counts: Record<Bucket, number> = { weekday_9_to_5: 0, weekday_5_to_10pm: 0, overnight_10pm_to_9am: 0, weekend: 0 }
  for (const d of dates) counts[bucket(d)]++
  const total = dates.length
  const outside = total - counts.weekday_9_to_5
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime())
  return {
    total,
    counts,
    outsideWeekdayOfficeHours: outside,
    outsideShare: total ? Math.round((outside / total) * 1000) / 10 : null,
    first: sorted[0]?.toISOString() ?? null,
    last: sorted.at(-1)?.toISOString() ?? null,
  }
}

export async function GET() {
  if (!isPreview() || !venueProductOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [leads, bookings] = await Promise.all([
    prisma.lead.findMany({ select: { createdAt: true } }),
    prisma.booking.findMany({ where: { status: 'CONFIRMED' }, select: { createdAt: true } }),
  ])
  return NextResponse.json({
    timeZone: TZ,
    inquiries: tally(leads.map((l) => l.createdAt)),
    confirmedBookings: tally(bookings.map((b) => b.createdAt)),
  })
}
