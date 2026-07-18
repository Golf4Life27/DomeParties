import { NextRequest, NextResponse } from 'next/server'
import { confirmPaid } from '@/lib/booking'
import { isStripeLive } from '@/lib/stripe'
import { isAdminRequest } from '@/lib/auth'

// POST /api/bookings/[id]/confirm-dev
// DEV-ONLY simulated deposit success. Disabled when Stripe is configured
// (then the Stripe webhook is the source of truth).
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
  const booking = await confirmPaid(id)
  return NextResponse.json({ ok: true, reference: booking.reference, status: booking.status })
}
