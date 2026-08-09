import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { formatCents } from '@/lib/money'
import { notifyStaff } from '@/lib/booking'

// Cancel a booking and free its bays (delete resource holds).
//
// Cancelling used to flip status and delete the holds without ever touching
// Stripe or mentioning money, so a deposit taken from a guest who cancelled
// within policy simply stayed in the account with nothing saying it was owed
// back. This now always reports what was collected, and will issue the refund
// when explicitly asked — POST { "refund": true }.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  const wantRefund = body?.refund === true

  const booking = await prisma.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // What the guest has actually paid us, and is therefore owed back.
  const collected =
    (booking.depositPaid ? Math.max(0, booking.depositAmount - booking.giftCardApplied) : 0) +
    (booking.balancePaid ? booking.balanceDue : 0)

  let refund: { ok: true; id: string; amount: number } | { ok: false; reason: string } | null = null

  if (wantRefund && collected > 0) {
    const stripe = getStripe()
    if (!stripe) {
      refund = { ok: false, reason: 'Stripe is not configured on this environment.' }
    } else if (!booking.stripePaymentIntentId) {
      refund = { ok: false, reason: 'No Stripe payment recorded on this booking.' }
    } else {
      try {
        const created = await stripe.refunds.create({
          payment_intent: booking.stripePaymentIntentId,
          amount: collected,
        })
        refund = { ok: true, id: created.id, amount: collected }
      } catch (e) {
        // Never let a failed refund block the cancellation — the bays still need
        // releasing, and staff need to be told the money is still sitting there.
        refund = { ok: false, reason: e instanceof Error ? e.message : 'Refund failed in Stripe.' }
      }
    }
  }

  await prisma.$transaction([
    prisma.bookingResource.deleteMany({ where: { bookingId: id } }),
    prisma.booking.update({ where: { id }, data: { status: 'CANCELLED' } }),
  ])

  // Money left with us after a cancellation is the thing most likely to be
  // forgotten, so say it out loud rather than only returning it to the caller.
  if (collected > 0 && (!refund || refund.ok === false)) {
    await notifyStaff({
      title: `Cancelled with ${formatCents(collected)} still held — ${booking.reference}`,
      lines: [
        `${booking.customerName ?? 'Guest'} · ${booking.date.toISOString().slice(0, 10)}.`,
        refund?.ok === false
          ? `Automatic refund failed: ${refund.reason}`
          : 'No refund was requested with this cancellation.',
        `Refund ${formatCents(collected)} in Stripe if the guest is due it.`,
      ],
      adminPath: `/admin/bookings/${booking.id}`,
      urgent: true,
    })
  }

  return NextResponse.json({
    ok: true,
    collected,
    refundOwed: refund?.ok ? 0 : collected,
    refund,
  })
}
