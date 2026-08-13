import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { availability } from '@/lib/availability'
import { rescheduleBooking } from '@/lib/booking'

/**
 * Move a booking to a new date/time without cancelling and rebooking it.
 *
 * POST { date: "2026-10-18", startMinutes: 660, notifyGuest?: boolean }
 *
 * GET ?date=2026-10-18 lists the start times that would actually fit this
 * booking's bays and duration on that day, so staff choose from real
 * availability instead of typing a time and finding out it collides.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  const result = await rescheduleBooking(id, {
    dateStr: String(body?.date ?? ''),
    startMinutes: Number(body?.startMinutes),
    notifyGuest: body?.notifyGuest !== false,
  })
  // 409, not 400: the request was well formed, the slot just isn't available (or
  // the booking is in a state that can't move). The UI shows `error` verbatim.
  if (!result.ok) return NextResponse.json(result, { status: 409 })
  return NextResponse.json(result)
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const dateStr = req.nextUrl.searchParams.get('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }
  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { baysNeeded: true, startMinutes: true, endMinutes: true },
  })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const duration = booking.endMinutes - booking.startMinutes
  // Staff aren't held to the online lead time, and this booking's own bays must
  // not read as busy when only the time is moving. An empty list still means "we
  // don't host that day" or "genuinely full" — the POST is the authority, this is
  // only a picker.
  const slots = await availability.getSlots(dateStr, booking.baysNeeded, duration, {
    excludeBookingId: id,
    ignoreLeadTime: true,
  })
  return NextResponse.json({
    duration,
    slots: slots.map((s) => ({
      startMinutes: s.startMinutes,
      label: s.label,
      availableBays: s.availableBays,
    })),
  })
}
