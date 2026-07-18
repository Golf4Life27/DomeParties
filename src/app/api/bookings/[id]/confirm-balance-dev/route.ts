import { NextRequest, NextResponse } from 'next/server'
import { confirmBalancePaid } from '@/lib/booking'
import { isStripeLive } from '@/lib/stripe'
import { isAdminRequest } from '@/lib/auth'

// DEV-only simulated balance payment (mirrors confirm-dev for deposits).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (isStripeLive()) {
    return NextResponse.json({ error: 'Stripe is configured — use the real payment flow.' }, { status: 400 })
  }
  if (!isAdminRequest(req)) {
    // Simulated payments must not be reachable by the public — until Stripe
    // keys are set, only an admin session may mark anything as paid.
    return NextResponse.json(
      { error: 'Online payment isn’t available yet — please call us to finish your booking.' },
      { status: 403 },
    )
  }
  const { id } = await ctx.params
  const booking = await confirmBalancePaid(id)
  return NextResponse.json({ ok: true, reference: booking.reference, balancePaid: booking.balancePaid })
}
