import { NextRequest, NextResponse } from 'next/server'
import { confirmPaid } from '@/lib/booking'
import { isStripeLive } from '@/lib/stripe'

// POST /api/bookings/[id]/confirm-dev
// DEV-ONLY simulated deposit success. Disabled when Stripe is configured
// (then the Stripe webhook is the source of truth).
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (isStripeLive()) {
    return NextResponse.json(
      { error: 'Stripe is configured — use the real payment flow.' },
      { status: 400 },
    )
  }
  const { id } = await ctx.params
  const booking = await confirmPaid(id)
  return NextResponse.json({ ok: true, reference: booking.reference, status: booking.status })
}
