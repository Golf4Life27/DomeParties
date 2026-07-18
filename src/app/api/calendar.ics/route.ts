import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { calendarFeedKey } from '@/lib/sign'
import { todayVenueMidnight } from '@/lib/time'
import { formatCents } from '@/lib/money'

export const dynamic = 'force-dynamic'

// GET /api/calendar.ics?key=... — read-only calendar feed of upcoming events
// (confirmed + paid-awaiting-review). Subscribe from a phone calendar app so
// Trackman reconciliation is one glance: every event shows its bays.
// Times are floating local (venue-local), which calendars show as-is.
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('key') !== calendarFeedKey()) {
    return NextResponse.json({ error: 'Invalid feed key' }, { status: 401 })
  }
  const bookings = await prisma.booking.findMany({
    where: {
      date: { gte: todayVenueMidnight() },
      OR: [{ status: 'CONFIRMED' }, { status: 'PENDING', depositPaid: true }],
    },
    include: { resources: { include: { resource: true } }, package: true },
    orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }],
    take: 500,
  })

  const pad = (n: number) => n.toString().padStart(2, '0')
  const events = bookings.map((b) => {
    const ds = b.date.toISOString().slice(0, 10).replaceAll('-', '')
    const stamp = (mins: number) => `${ds}T${pad(Math.floor(mins / 60))}${pad(mins % 60)}00`
    const bays = b.resources.map((r) => r.resource.name).join(', ') || 'no bays assigned'
    const review = b.status === 'PENDING' ? ' [NEEDS REVIEW]' : ''
    const balance = b.balancePaid ? 'balance paid' : `balance due ${formatCents(b.balanceDue)}`
    return [
      'BEGIN:VEVENT',
      `UID:${b.reference}@dome-parties`,
      `SUMMARY:${b.reference}${review} — ${b.customerName ?? 'Guest'} (${b.partySize} guests) — ${bays}`,
      `DTSTART:${stamp(b.startMinutes)}`,
      `DTEND:${stamp(b.endMinutes)}`,
      'LOCATION:Whitetail Ridge Golf Dome',
      `DESCRIPTION:${(b.package?.name ?? 'Custom event').replace(/[,;]/g, ' ')} · ${bays} · ${balance}${b.customerPhone ? ` · ${b.customerPhone}` : ''}`,
      'END:VEVENT',
    ].join('\r\n')
  })

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Whitetail Ridge Golf Dome//Events//EN',
    'X-WR-CALNAME:Dome Parties',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="dome-parties.ics"',
    },
  })
}
