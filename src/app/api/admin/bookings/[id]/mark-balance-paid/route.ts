import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { confirmBalancePaid } from '@/lib/booking'

// POST — staff records a balance settled at the venue (cash/POS), so the books
// stop showing money owed and the guest gets a receipt.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const booking = await prisma.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (booking.status !== 'CONFIRMED' && booking.status !== 'COMPLETED') {
    return NextResponse.json({ error: 'Only confirmed/completed bookings have balances.' }, { status: 409 })
  }
  if (booking.balancePaid) return NextResponse.json({ ok: true, already: true })
  const updated = await confirmBalancePaid(id)
  return NextResponse.json({ ok: true, balancePaid: updated.balancePaid })
}
