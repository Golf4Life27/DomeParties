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
  // balancePaidAmount is cumulative and is the only honest source here: balanceDue
  // is zeroed when the balance is paid, and an upsell after that sets balancePaid
  // back to false, so the old `balancePaid ? balanceDue : 0` reported nothing
  // collected on exactly the bookings that had paid the most.
  const depositCollected = booking.depositPaid
    ? Math.max(0, booking.depositAmount - booking.giftCardApplied)
    : 0
  const collected = depositCollected + booking.balancePaidAmount

  let refund: { ok: true; id: string; amount: number } | { ok: false; reason: string } | null = null
  // Money the guest paid that this route could not send back on its own.
  let handRefundOwed = 0

  if (wantRefund && collected > 0) {
    const stripe = getStripe()
    if (!stripe) {
      refund = { ok: false, reason: 'Stripe is not configured on this environment.' }
    } else if (!booking.depositPaid || !booking.stripePaymentIntentId) {
      refund = { ok: false, reason: 'No Stripe payment recorded on this booking.' }
    } else {
      try {
        // Refund the whole deposit charge instead of a figure we recompute here.
        // The guest pays depositAmount PLUS the card fee (3.5%), so refunding
        // depositAmount alone silently kept the fee: the first live cancellation
        // returned $26.40 of $27.32 and Stripe logged it as a partial refund. On a
        // $500 deposit that is $17.50 of a cancelling guest's money. Omitting
        // `amount` refunds exactly what was captured, whatever the fee was on the
        // day, with no arithmetic here to drift out of step with pricing.
        const created = await stripe.refunds.create({
          payment_intent: booking.stripePaymentIntentId,
        })
        refund = { ok: true, id: created.id, amount: created.amount }
        // stripePaymentIntentId is the DEPOSIT intent; createBalanceIntent never
        // records its own. So a paid balance cannot be refunded from here — say so
        // loudly rather than reporting a clean refund that only covered part of it.
        handRefundOwed = booking.balancePaidAmount
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
  const stillHeld = refund?.ok ? handRefundOwed : collected
  if (stillHeld > 0) {
    await notifyStaff({
      title: `Cancelled with ${formatCents(stillHeld)} still held — ${booking.reference}`,
      lines: [
        `${booking.customerName ?? 'Guest'} · ${booking.date.toISOString().slice(0, 10)}.`,
        refund?.ok
          ? `The ${formatCents(refund.amount)} deposit charge was refunded, but the balance paid ahead was taken on a separate payment this booking never recorded.`
          : refund?.ok === false
            ? `Automatic refund failed: ${refund.reason}`
            : 'No refund was requested with this cancellation.',
        `Refund ${formatCents(stillHeld)} in Stripe by hand if the guest is due it.`,
      ],
      adminPath: `/admin/bookings/${booking.id}`,
      urgent: true,
    })
  }

  return NextResponse.json({
    ok: true,
    collected,
    refundOwed: stillHeld,
    refund,
  })
}
