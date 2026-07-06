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
  /** What's being paid — used in button copy. Defaults to "deposit". */
  label?: string
  /** Dev-mode simulated-success endpoint. Defaults to the deposit confirm. */
  devConfirmPath?: string
  /** Where to land after success. Defaults to the booking confirmation page. */
  returnPath?: string
}

const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = pk ? loadStripe(pk) : null

export default function PaymentStep({
  bookingId,
  depositAmount,
  mode,
  clientSecret,
  label = 'deposit',
  devConfirmPath,
  returnPath,
}: Props) {
  const confirmPath = devConfirmPath ?? `/api/bookings/${bookingId}/confirm-dev`
  const successPath = returnPath ?? `/book/confirmation/${bookingId}`

  if (mode === 'stripe' && clientSecret && stripePromise) {
    return (
      <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'flat' } }}>
        <StripeForm amount={depositAmount} label={label} successPath={successPath} />
      </Elements>
    )
  }
  return <DevPay amount={depositAmount} label={label} confirmPath={confirmPath} successPath={successPath} />
}

function StripeForm({ amount, label, successPath }: { amount: number; label: string; successPath: string }) {
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
        return_url: `${window.location.origin}${successPath}`,
      },
    })
    if (error) {
      setError(error.message ?? 'Payment failed')
      setBusy(false)
    }
    // On success Stripe redirects to return_url; the webhook finalizes server-side.
  }

  return (
    <div>
      <PaymentElement />
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <button
        onClick={pay}
        disabled={busy || !stripe}
        className="mt-5 w-full rounded-full bg-accent px-6 py-4 text-lg font-bold text-ink shadow transition hover:bg-accent-dark hover:text-ink disabled:opacity-60"
      >
        {busy ? 'Processing…' : `Pay ${formatCents(amount)} ${label}`}
      </button>
    </div>
  )
}

function DevPay({
  amount,
  label,
  confirmPath,
  successPath,
}: {
  amount: number
  label: string
  confirmPath: string
  successPath: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pay() {
    setBusy(true)
    setError(null)
    const res = await fetch(confirmPath, { method: 'POST' })
    if (!res.ok) {
      setError('Could not confirm (dev).')
      setBusy(false)
      return
    }
    window.location.href = successPath
  }

  return (
    <div>
      <div className="rounded-lg bg-amber-400/10 p-3 text-sm text-amber-300 ring-1 ring-amber-400/30">
        <strong>Test mode.</strong> Stripe keys aren&apos;t configured yet, so this simulates
        a successful payment so the full flow is testable. Add the Dome&apos;s Stripe test
        keys to enable real card entry.
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <button
        onClick={pay}
        disabled={busy}
        className="mt-5 w-full rounded-full bg-accent px-6 py-4 text-lg font-bold text-ink shadow transition hover:bg-accent-dark hover:text-ink disabled:opacity-60"
      >
        {busy ? 'Processing…' : `Pay ${formatCents(amount)} ${label} (test)`}
      </button>
    </div>
  )
}
