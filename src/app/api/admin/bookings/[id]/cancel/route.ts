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

  // A booking can hold two separate charges — the deposit and, if they paid
  // ahead, the balance. Both are refunded, and each reports its own outcome so a
  // half-success can't read as a clean refund.
  type RefundResult =
    | { kind: 'deposit' | 'balance'; ok: true; id: string; amount: number }
    | { kind: 'deposit' | 'balance'; ok: false; reason: string }
  const refunds: RefundResult[] = []
  // Money the guest paid that this route could not send back on its own.
  let handRefundOwed = 0

  if (wantRefund && collected > 0) {
    const stripe = getStripe()
    const charges: { kind: 'deposit' | 'balance'; intentId: string | null; amount: number }[] = [
      { kind: 'deposit', intentId: booking.stripePaymentIntentId, amount: depositCollected },
      { kind: 'balance', intentId: booking.stripeBalanceIntentId, amount: booking.balancePaidAmount },
    ]

    for (const charge of charges) {
      if (charge.amount <= 0) continue
      if (!stripe) {
        refunds.push({ kind: charge.kind, ok: false, reason: 'Stripe is not configured on this environment.' })
        handRefundOwed += charge.amount
        continue
      }
      if (!charge.intentId) {
        // Balances settled in cash, and balances paid before the intent id was
        // recorded, have nothing to refund against.
        refunds.push({
          kind: charge.kind,
          ok: false,
          reason: `No Stripe payment intent recorded for the ${charge.kind}.`,
        })
        handRefundOwed += charge.amount
        continue
      }
      try {
        // Refund the whole charge instead of a figure we recompute here. The guest
        // pays the amount PLUS the card fee (3.5%), so refunding the amount alone
        // silently keeps the fee: the first live cancellation returned $26.40 of
        // $27.32 and Stripe logged it as a partial refund. On a $500 deposit that
        // is $17.50 of a cancelling guest's money. Omitting `amount` refunds
        // exactly what was captured, whatever the fee was on the day, with no
        // arithmetic here to drift out of step with pricing.
        const created = await stripe.refunds.create({ payment_intent: charge.intentId })
        refunds.push({ kind: charge.kind, ok: true, id: created.id, amount: created.amount })
      } catch (e) {
        // Never let a failed refund block the cancellation — the bays still need
        // releasing, and staff need to be told the money is still sitting there.
        refunds.push({
          kind: charge.kind,
          ok: false,
          reason: e instanceof Error ? e.message : 'Refund failed in Stripe.',
        })
        handRefundOwed += charge.amount
      }
    }
  }

  await prisma.$transaction([
    prisma.bookingResource.deleteMany({ where: { bookingId: id } }),
    prisma.booking.update({ where: { id }, data: { status: 'CANCELLED' } }),
  ])

  // Money left with us after a cancellation is the thing most likely to be
  // forgotten, so say it out loud rather than only returning it to the caller.
  // Anything a requested refund could not send back is counted in handRefundOwed;
  // with no refund requested, everything collected is still sitting here.
  const stillHeld = wantRefund ? handRefundOwed : collected
  const refunded = refunds.reduce((sum, r) => sum + (r.ok ? r.amount : 0), 0)

  if (stillHeld > 0) {
    await notifyStaff({
      title: `Cancelled with ${formatCents(stillHeld)} still held — ${booking.reference}`,
      lines: [
        `${booking.customerName ?? 'Guest'} · ${booking.date.toISOString().slice(0, 10)}.`,
        ...(wantRefund
          ? refunds.map((r) =>
              r.ok
                ? `${r.kind === 'deposit' ? 'Deposit' : 'Balance'}: ${formatCents(r.amount)} refunded.`
                : `${r.kind === 'deposit' ? 'Deposit' : 'Balance'}: NOT refunded — ${r.reason}`,
            )
          : ['No refund was requested with this cancellation.']),
        `Refund ${formatCents(stillHeld)} in Stripe by hand if the guest is due it.`,
      ],
      adminPath: `/admin/bookings/${booking.id}`,
      urgent: true,
    })
  }

  return NextResponse.json({
    ok: true,
    collected,
    refunded,
    refundOwed: stillHeld,
    refunds,
  })
}
