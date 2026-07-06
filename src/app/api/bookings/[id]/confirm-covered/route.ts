import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { confirmPaid } from '@/lib/booking'

// POST /api/bookings/[id]/confirm-covered — confirm a booking whose deposit is
// fully covered by a gift card (nothing to charge). Works in dev and live.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const booking = await prisma.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const amountDue = booking.depositAmount - booking.giftCardApplied
  if (amountDue > 0) {
    return NextResponse.json({ error: 'A payment is still required.' }, { status: 400 })
  }
  const updated = await confirmPaid(id)
  return NextResponse.json({ ok: true, reference: updated.reference, status: updated.status })
}
