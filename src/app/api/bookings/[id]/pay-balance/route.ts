import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createBalanceIntent } from '@/lib/booking'

// POST /api/bookings/[id]/pay-balance — public: pay the outstanding event
// balance ahead of time (skip the line).
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const booking = await prisma.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const payment = await createBalanceIntent(id)
  if (!payment) {
    return NextResponse.json({ error: 'No balance is due on this booking.' }, { status: 409 })
  }
  return NextResponse.json({ payment, balanceDue: booking.balanceDue, reference: booking.reference })
}
