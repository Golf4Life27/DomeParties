'use client'

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { formatCents } from '@/lib/money'

type Props = {
  bookingId: string
  depositAmount: number
  mode: 'dev' | 'stripe'
  clientSecret: string | null
}

const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = pk ? loadStripe(pk) : null

export default function PaymentStep({ bookingId, depositAmount, mode, clientSecret }: Props) {
  if (mode === 'stripe' && clientSecret && stripePromise) {
    return (
      <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'flat' } }}>
        <StripeForm bookingId={bookingId} depositAmount={depositAmount} />
      </Elements>
    )
  }
  return <DevPay bookingId={bookingId} depositAmount={depositAmount} />
}

function StripeForm({ bookingId, depositAmount }: { bookingId: string; depositAmount: number }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pay() {
    if (!stripe || !elements) return
    setBusy(true)
    setError(null)
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/book/confirmation/${bookingId}`,
      },
    })
    if (error) {
      setError(error.message ?? 'Payment failed')
      setBusy(false)
    }
    // On success Stripe redirects to return_url; the webhook confirms the booking.
  }

  return (
    <div>
      <PaymentElement />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        onClick={pay}
        disabled={busy || !stripe}
        className="mt-5 w-full rounded-full bg-accent px-6 py-4 text-lg font-bold text-brand-dark shadow transition hover:bg-accent-dark hover:text-white disabled:opacity-60"
      >
        {busy ? 'Processing…' : `Pay ${formatCents(depositAmount)} deposit`}
      </button>
    </div>
  )
}

function DevPay({ bookingId, depositAmount }: { bookingId: string; depositAmount: number }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pay() {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/bookings/${bookingId}/confirm-dev`, { method: 'POST' })
    if (!res.ok) {
      setError('Could not confirm (dev).')
      setBusy(false)
      return
    }
    window.location.href = `/book/confirmation/${bookingId}`
  }

  return (
    <div>
      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
        <strong>Test mode.</strong> Stripe keys aren&apos;t configured yet, so this
        simulates a successful deposit so the full flow is testable. Add the Dome&apos;s
        Stripe test keys to enable real card entry.
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        onClick={pay}
        disabled={busy}
        className="mt-5 w-full rounded-full bg-accent px-6 py-4 text-lg font-bold text-brand-dark shadow transition hover:bg-accent-dark hover:text-white disabled:opacity-60"
      >
        {busy ? 'Processing…' : `Pay ${formatCents(depositAmount)} deposit (test)`}
      </button>
    </div>
  )
}
