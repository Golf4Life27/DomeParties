import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { confirmPaid, confirmBalancePaid } from '@/lib/booking'
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
    const intent = event.data.object as { id: string; metadata?: Record<string, string> }
    const meta = intent.metadata ?? {}
    try {
      if (meta.kind === 'gift' && meta.giftCardId) {
        await confirmGiftPaid(meta.giftCardId, intent.id)
      } else if (meta.kind === 'balance' && meta.bookingId) {
        await confirmBalancePaid(meta.bookingId)
      } else if (meta.bookingId) {
        await confirmPaid(meta.bookingId, intent.id)
      }
    } catch (e) {
      console.error('webhook processing failed', e)
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}
