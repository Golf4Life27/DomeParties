import { NextRequest, NextResponse } from 'next/server'
import { confirmBalancePaid } from '@/lib/booking'
import { isStripeLive } from '@/lib/stripe'

// DEV-only simulated balance payment (mirrors confirm-dev for deposits).
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (isStripeLive()) {
    return NextResponse.json({ error: 'Stripe is configured — use the real payment flow.' }, { status: 400 })
  }
  const { id } = await ctx.params
  const booking = await confirmBalancePaid(id)
  return NextResponse.json({ ok: true, reference: booking.reference, balancePaid: booking.balancePaid })
}
