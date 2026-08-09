import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { confirmPaid } from '@/lib/booking'

// POST /api/bookings/[id]/confirm-covered — settle a booking whose deposit is
// fully covered by a gift card, so there is nothing to charge. Called from the
// booking flow when createDepositIntent returns mode: 'covered'.
//
// This endpoint is public (booking ids travel in emailed links), so it confirms
// a real party with real bays and must prove the deposit was genuinely covered
// before it does. It previously gated only on
// `depositAmount - giftCardApplied > 0`, which a brand-new DRAFT satisfies
// trivially: only placeHold writes pricing, so depositAmount is still 0 and the
// subtraction is 0. Three unauthenticated calls — create, patch in a date and
// package, confirm — produced a confirmed booking with bays assigned on a real
// Saturday and $0 collected.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const booking = await prisma.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only a live hold awaiting payment can be settled this way.
  if (booking.status !== 'PENDING' || booking.depositPaid) {
    return NextResponse.json({ error: 'This booking is not awaiting payment.' }, { status: 409 })
  }

  // Two things can legitimately leave nothing to charge, and both are written
  // only by server-side validation the caller can't forge:
  //   - a gift card that covers the whole deposit (validateGiftCard), or
  //   - a promo that discounts the total to zero (validatePromo).
  const coveredByGiftCard =
    booking.giftCardCode !== null && booking.giftCardApplied >= booking.depositAmount
  const zeroedByPromo = booking.depositAmount === 0 && booking.promoDiscount > 0

  if (!coveredByGiftCard && !zeroedByPromo) {
    // Includes the case this route used to wave through: a booking with no
    // pricing at all, where depositAmount is still the schema default of 0.
    return NextResponse.json({ error: 'A payment is still required.' }, { status: 400 })
  }

  const updated = await confirmPaid(id)
  return NextResponse.json({ ok: true, reference: updated.reference, status: updated.status })
}
