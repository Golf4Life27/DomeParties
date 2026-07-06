import { NextRequest, NextResponse } from 'next/server'
import { sendRecoveryEmail } from '@/lib/booking'

// POST /api/admin/bookings/[id]/recover — send one abandoned-cart recovery email.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const ok = await sendRecoveryEmail(id)
  if (!ok) {
    return NextResponse.json({ error: 'Not an eligible draft (needs a saved email).' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
