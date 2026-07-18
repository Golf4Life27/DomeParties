import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import { confirmPaid, confirmBalancePaid, notifyStaff } from '@/lib/booking'
import { confirmGiftPaid } from '@/lib/giftcards'

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

  return NextResponse.json({ received: true })
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
