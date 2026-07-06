import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { validatePromo } from '@/lib/promos'
import { applyPercent } from '@/lib/money'

const schema = z.object({ code: z.string().min(1) })

/** Recompute booking money for a given discount (replacing any prior promo). */
async function applyDiscount(bookingId: string, code: string | null, discount: number) {
  const [booking, setting] = await Promise.all([
    prisma.booking.findUniqueOrThrow({ where: { id: bookingId } }),
    prisma.setting.findUniqueOrThrow({ where: { id: 1 } }),
  ])
  const baseTotal = booking.total + booking.promoDiscount // undo prior promo
  const total = Math.max(0, baseTotal - discount)
  const depositAmount = applyPercent(total, setting.depositPercent)
  const giftCardApplied = booking.giftCardCode
    ? Math.min(booking.giftCardApplied, depositAmount)
    : 0
  return prisma.booking.update({
    where: { id: bookingId },
    data: {
      promoCode: code,
      promoDiscount: discount,
      total,
      depositAmount,
      balanceDue: total - depositAmount,
      giftCardApplied,
    },
  })
}

// POST /api/bookings/[id]/apply-promo — apply a promo to a PENDING booking.
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

  const dow = booking.date.getUTCDay()
  const baseTotal = booking.total + booking.promoDiscount
  const v = await validatePromo(parsed.data.code, baseTotal, dow)
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 })

  const updated = await applyDiscount(id, v.code, v.discount)
  return NextResponse.json({
    ok: true,
    discount: v.discount,
    total: updated.total,
    depositAmount: updated.depositAmount,
  })
}

// DELETE — remove an applied promo.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const updated = await applyDiscount(id, null, 0)
  return NextResponse.json({ ok: true, total: updated.total, depositAmount: updated.depositAmount })
}
