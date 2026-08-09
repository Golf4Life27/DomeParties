import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import { confirmPaid, confirmBalancePaid, notifyStaff } from '@/lib/booking'
import { confirmGiftPaid } from '@/lib/giftcards'
import { formatCents } from '@/lib/money'

// Stripe sends the raw body; we must verify the signature against it.
export async function POST(req: NextRequest) {
  const stripe = getStripe()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 400 })
  }

  const sig = req.headers.get('stripe-signature')
  const raw = await req.text()
  let event
  try {
    event = stripe.webhooks.constructEvent(raw, sig ?? '', webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as { id: string; amount: number; metadata?: Record<string, string> }
    const meta = intent.metadata ?? {}
    try {
      if (meta.kind === 'gift' && meta.giftCardId) {
        await confirmGiftPaid(meta.giftCardId, intent.id)
      } else if (meta.kind === 'balance' && meta.bookingId) {
        const ok = await verifyIntentAmount(meta.bookingId, intent, 'balance')
        if (ok) await confirmBalancePaid(meta.bookingId)
      } else if (meta.bookingId) {
        const ok = await verifyIntentAmount(meta.bookingId, intent, 'deposit')
        if (ok) await confirmPaid(meta.bookingId, intent.id)
      }
    } catch (e) {
      console.error('webhook processing failed', e)
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
    }
  }

  // Money going the other way. None of these were handled before, so a refund
  // left the booking CONFIRMED and depositPaid with nothing anywhere saying the
  // money had gone back, and a chargeback held the bay while the funds were
  // clawed back — discovered from the bank statement.
  //
  // These flag and shout rather than deciding for staff: a refund can be a
  // cancellation, or a partial goodwill gesture on an event still going ahead.
  // Auto-cancelling would be wrong as often as it was right.
  else if (event.type === 'charge.refunded') {
    const charge = event.data.object as {
      payment_intent?: string | null
      amount_refunded?: number
      amount?: number
    }
    await flagByIntent(charge.payment_intent, (b) => ({
      title: `Refund issued — ${b.reference}`,
      lines: [
        `${formatCents(charge.amount_refunded ?? 0)} refunded of ${formatCents(charge.amount ?? 0)} charged.`,
        `${b.customerName ?? 'Guest'} · ${b.partySize} golfers · ${b.date.toISOString().slice(0, 10)}.`,
        (charge.amount_refunded ?? 0) >= (charge.amount ?? 0)
          ? 'Fully refunded. If the event is off, cancel it here so the bays are released.'
          : 'Partial refund. Check the balance still owed is right.',
      ],
    }))
  } else if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object as {
      payment_intent?: string | null
      amount?: number
      reason?: string
    }
    await flagByIntent(dispute.payment_intent, (b) => ({
      title: `Chargeback opened — ${b.reference}`,
      lines: [
        `${formatCents(dispute.amount ?? 0)} disputed. Reason: ${dispute.reason ?? 'unknown'}.`,
        `${b.customerName ?? 'Guest'} · ${b.date.toISOString().slice(0, 10)} · bays are still held.`,
        'Respond in Stripe before the deadline, and decide whether to keep the booking.',
      ],
    }))
  } else if (event.type === 'charge.dispute.closed') {
    const dispute = event.data.object as {
      payment_intent?: string | null
      amount?: number
      status?: string
    }
    await flagByIntent(dispute.payment_intent, (b) => ({
      title: `Chargeback closed (${dispute.status ?? 'unknown'}) — ${b.reference}`,
      lines: [
        `${formatCents(dispute.amount ?? 0)} dispute finished with status: ${dispute.status ?? 'unknown'}.`,
        dispute.status === 'lost'
          ? 'The money is gone. Decide whether the event still goes ahead.'
          : 'No action needed if this was won.',
      ],
    }))
  } else if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as {
      id: string
      metadata?: Record<string, string>
      last_payment_error?: { message?: string }
    }
    const bookingId = intent.metadata?.bookingId
    if (bookingId) {
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
      if (booking) {
        // Not urgent and no review flag — a declined card is routine, and the
        // guest is looking at the error already. Staff just want to know a
        // near-miss happened so they can follow up on a lost booking.
        await notifyStaff({
          title: `Card declined — ${booking.reference}`,
          lines: [
            `${booking.customerName ?? 'Guest'} · ${booking.customerEmail ?? 'no email'}.`,
            intent.last_payment_error?.message ?? 'No reason given by Stripe.',
            'The hold is still live until it expires — worth a call.',
          ],
          adminPath: `/admin/bookings/${booking.id}`,
        })
      }
    }
  }

  return NextResponse.json({ received: true })
}

/**
 * Find the booking a charge belongs to via the payment intent we recorded, set
 * it for review, and alert staff. Silent when the intent maps to nothing we know
 * (e.g. a gift-card purchase) — there is no booking to act on.
 */
async function flagByIntent(
  paymentIntentId: string | null | undefined,
  message: (booking: {
    id: string
    reference: string
    customerName: string | null
    partySize: number
    date: Date
  }) => { title: string; lines: string[] },
) {
  if (!paymentIntentId) return
  const booking = await prisma.booking.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
  })
  if (!booking) return
  await prisma.booking.update({ where: { id: booking.id }, data: { needsReview: true } })
  const { title, lines } = message(booking)
  await notifyStaff({ title, lines, adminPath: `/admin/bookings/${booking.id}`, urgent: true })
}

/**
 * A succeeded intent only confirms a booking if it is the intent we minted for
 * it AND covers what the booking currently owes — a stale, cheaper intent
 * (booking upgraded after intent creation) must not mark the new price paid.
 * On mismatch: record nothing, flag for review, alert staff. Never reject the
 * money silently.
 */
async function verifyIntentAmount(
  bookingId: string,
  intent: { id: string; amount: number },
  kind: 'deposit' | 'balance',
): Promise<boolean> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
  if (!booking) return false
  const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } })
  const base =
    kind === 'deposit'
      ? Math.max(0, booking.depositAmount - booking.giftCardApplied)
      : booking.balanceDue
  const cardFee = setting.cardFeePct > 0 ? Math.round((base * setting.cardFeePct) / 100) : 0
  const expected = base + cardFee
  const intentMatches = kind === 'balance' || !booking.stripePaymentIntentId || booking.stripePaymentIntentId === intent.id
  if (intent.amount >= expected && intentMatches) return true

  await prisma.booking.update({ where: { id: bookingId }, data: { needsReview: true } })
  await notifyStaff({
    title: `Payment amount mismatch — ${booking.reference}`,
    lines: [
      `A ${kind} payment of ${(intent.amount / 100).toFixed(2)} arrived but the booking currently owes ${(expected / 100).toFixed(2)}${intentMatches ? '' : ' (and the payment intent does not match the one on file)'}.`,
      'The booking was NOT confirmed. Check Stripe and the booking, then approve or refund.',
    ],
    adminPath: `/admin/bookings/${bookingId}`,
    urgent: true,
  })
  return false
}
