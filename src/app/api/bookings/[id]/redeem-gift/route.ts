import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { validateGiftCard } from '@/lib/giftcards'

const schema = z.object({ code: z.string().min(1) })

// POST /api/bookings/[id]/redeem-gift — apply a gift card toward the deposit due.
// Records the intended application; the balance is debited at confirmation.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Code required' }, { status: 400 })

  const booking = await prisma.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (booking.status !== 'PENDING' || booking.depositPaid) {
    return NextResponse.json({ error: 'This booking is not awaiting payment.' }, { status: 409 })
  }

  const v = await validateGiftCard(parsed.data.code)
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 })

  const applied = Math.min(v.balance, booking.depositAmount)
  await prisma.booking.update({
    where: { id },
    data: { giftCardCode: v.code, giftCardApplied: applied },
  })
  return NextResponse.json({
    ok: true,
    applied,
    amountDue: Math.max(0, booking.depositAmount - applied),
    balanceAfter: v.balance - applied,
  })
}

// DELETE — remove an applied gift card (only while payment is still pending).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const booking = await prisma.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (booking.status !== 'PENDING' || booking.depositPaid) {
    return NextResponse.json({ error: 'This booking is not awaiting payment.' }, { status: 409 })
  }
  await prisma.booking.update({ where: { id }, data: { giftCardCode: null, giftCardApplied: 0 } })
  return NextResponse.json({ ok: true })
}
