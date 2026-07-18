import { NextRequest, NextResponse } from 'next/server'
import { confirmGiftPaid } from '@/lib/giftcards'
import { isStripeLive } from '@/lib/stripe'
import { isAdminRequest } from '@/lib/auth'

// POST /api/gift/[id]/confirm-dev — DEV-only simulated gift payment success.
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
  const gift = await confirmGiftPaid(id)
  return NextResponse.json({ ok: true, code: gift.code, status: gift.status })
}
