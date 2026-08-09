import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createDepositIntent } from '@/lib/booking'

// POST /api/bookings/[id]/pay — public deposit-intent for a PENDING quote booking
// (the customer-facing /pay/[id] page). Distinct from /checkout, which also
// places an availability hold for the self-serve Instant Book flow.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const booking = await prisma.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // depositPaid as well as status: a booking can sit PENDING with the deposit
  // already collected (the needs-review path), and minting a second intent there
  // means capturing a second deposit for the same event.
  if (booking.status !== 'PENDING' || booking.depositPaid) {
    return NextResponse.json({ error: 'This booking is not awaiting payment.' }, { status: 409 })
  }
  const payment = await createDepositIntent(id)
  return NextResponse.json({
    payment,
    depositAmount: booking.depositAmount,
    total: booking.total,
    reference: booking.reference,
  })
}
