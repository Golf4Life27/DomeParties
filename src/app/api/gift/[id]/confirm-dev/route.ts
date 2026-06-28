import { NextRequest, NextResponse } from 'next/server'
import { confirmGiftPaid } from '@/lib/giftcards'
import { isStripeLive } from '@/lib/stripe'

// POST /api/gift/[id]/confirm-dev — DEV-only simulated gift payment success.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (isStripeLive()) {
    return NextResponse.json({ error: 'Stripe is configured — use the real payment flow.' }, { status: 400 })
  }
  const { id } = await ctx.params
  const gift = await confirmGiftPaid(id)
  return NextResponse.json({ ok: true, code: gift.code, status: gift.status })
}
