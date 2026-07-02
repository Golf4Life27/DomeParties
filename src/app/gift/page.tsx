'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { formatCents } from '@/lib/money'

const PRESETS = [5000, 10000, 15000, 25000]
const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = pk ? loadStripe(pk) : null

type Payment = { mode: 'dev' | 'stripe' | 'covered'; clientSecret: string | null; amount: number }

export default function GiftPage() {
  const [amount, setAmount] = useState(10000)
  const [customAmount, setCustom] = useState('')
  const [purchaserName, setPurchaserName] = useState('')
  const [purchaserEmail, setPurchaserEmail] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [giftId, setGiftId] = useState<string | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [stripeReturn, setStripeReturn] = useState(false)

  // Returning from a live Stripe payment (?paid=1): the webhook activates the
  // card and emails both parties — show success instead of an empty form.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('paid') === '1') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStripeReturn(true)
    }
  }, [])

  const effectiveAmount = customAmount ? Math.round(parseFloat(customAmount) * 100) : amount

  async function start(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (effectiveAmount < 1000) return setError('Minimum gift card is $10.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(purchaserEmail) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
      return setError('Please enter valid email addresses.')
    }
    setBusy(true)
    const res = await fetch('/api/gift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: effectiveAmount, purchaserName, purchaserEmail, recipientName, recipientEmail, message }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) return setError(data.error ?? 'Something went wrong.')
    setGiftId(data.giftId)
    setPayment(data.payment)
  }

  if (stripeReturn) {
    return (
      <Shell>
        <div className="rounded-2xl bg-surface p-8 text-center shadow-sm ring-1 ring-white/10">
          <div className="text-5xl">🎁</div>
          <h1 className="mt-4 text-2xl font-bold text-brand">Payment received!</h1>
          <p className="mt-2 text-foreground/70">
            The gift card is on its way to the recipient&apos;s inbox, and your receipt (with
            the code) is headed to yours.
          </p>
          <div className="mt-6">
            <Link href="/" className="text-sm font-medium text-brand hover:underline">← Back to home</Link>
          </div>
        </div>
      </Shell>
    )
  }

  if (code) {
    return (
      <Shell>
        <div className="rounded-2xl bg-surface p-8 text-center shadow-sm ring-1 ring-white/10">
          <div className="text-5xl">🎁</div>
          <h1 className="mt-4 text-2xl font-bold text-brand">Gift card sent!</h1>
          <p className="mt-2 text-foreground/70">
            We emailed the {formatCents(effectiveAmount)} gift card to {recipientEmail}.
          </p>
          <div className="mt-4 inline-block rounded-lg border-2 border-dashed border-brand px-6 py-3">
            <div className="text-xs text-foreground/50">CODE</div>
            <div className="text-xl font-bold tracking-wider">{code}</div>
          </div>
          <div className="mt-6">
            <Link href="/" className="text-sm font-medium text-brand hover:underline">← Back to home</Link>
          </div>
        </div>
      </Shell>
    )
  }

  if (payment && giftId) {
    return (
      <Shell>
        <div className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-white/10">
          <h1 className="text-xl font-bold text-brand">Pay {formatCents(effectiveAmount)}</h1>
          <p className="mt-1 text-sm text-foreground/60">Gift card for {recipientName || recipientEmail}</p>
          <div className="mt-5">
            {payment.mode === 'stripe' && payment.clientSecret && stripePromise ? (
              <Elements stripe={stripePromise} options={{ clientSecret: payment.clientSecret, appearance: { theme: 'flat' } }}>
                <StripeGiftForm amount={effectiveAmount} />
              </Elements>
            ) : (
              <DevGiftPay giftId={giftId} amount={effectiveAmount} onPaid={setCode} />
            )}
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <form onSubmit={start} className="animate-fade-up">
        <h1 className="text-3xl font-bold text-brand">Give the gift of a great time 🎁</h1>
        <p className="mt-1 text-foreground/60">A Whitetail Ridge Golf Dome gift card — perfect for any occasion.</p>

        <div className="mt-6 space-y-6 rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-white/10">
          <div>
            <Label>Amount</Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((a) => (
                <button
                  type="button"
                  key={a}
                  onClick={() => { setAmount(a); setCustom('') }}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 transition ${
                    !customAmount && amount === a ? 'bg-brand text-ink ring-brand' : 'bg-surface ring-white/15 hover:ring-brand'
                  }`}
                >
                  {formatCents(a)}
                </button>
              ))}
              <div className="flex items-center">
                <span className="mr-1 text-foreground/50">$</span>
                <input
                  type="number" min="10" placeholder="Custom"
                  value={customAmount} onChange={(e) => setCustom(e.target.value)}
                  className="w-28 rounded-lg border border-white/20 px-3 py-2 outline-none focus:border-brand"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name"><input value={purchaserName} onChange={(e) => setPurchaserName(e.target.value)} className={input} /></Field>
            <Field label="Your email"><input type="email" value={purchaserEmail} onChange={(e) => setPurchaserEmail(e.target.value)} className={input} /></Field>
            <Field label="Recipient name"><input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className={input} /></Field>
            <Field label="Recipient email"><input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} className={input} /></Field>
          </div>
          <Field label="Message (optional)"><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className={input} placeholder="Happy birthday! 🎉" /></Field>

          {error && <p className="text-sm text-red-400">{error}</p>}
          <button disabled={busy} className="w-full rounded-full bg-accent px-6 py-4 text-lg font-bold text-ink shadow transition hover:bg-accent-dark hover:text-ink disabled:opacity-60">
            {busy ? 'Preparing…' : `Continue to payment →`}
          </button>
        </div>
      </form>
    </Shell>
  )
}

function StripeGiftForm({ amount }: { amount: number }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function pay() {
    if (!stripe || !elements) return
    setBusy(true); setError(null)
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/gift?paid=1` },
    })
    if (error) { setError(error.message ?? 'Payment failed'); setBusy(false) }
  }
  return (
    <div>
      <PaymentElement />
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <button onClick={pay} disabled={busy || !stripe} className="mt-5 w-full rounded-full bg-accent px-6 py-4 text-lg font-bold text-ink transition hover:bg-accent-dark hover:text-ink disabled:opacity-60">
        {busy ? 'Processing…' : `Pay ${formatCents(amount)}`}
      </button>
    </div>
  )
}

function DevGiftPay({ giftId, amount, onPaid }: { giftId: string; amount: number; onPaid: (code: string) => void }) {
  const [busy, setBusy] = useState(false)
  async function pay() {
    setBusy(true)
    const res = await fetch(`/api/gift/${giftId}/confirm-dev`, { method: 'POST' })
    const data = await res.json()
    setBusy(false)
    if (res.ok) onPaid(data.code)
  }
  return (
    <div>
      <div className="rounded-lg bg-amber-400/10 p-3 text-sm text-amber-300 ring-1 ring-amber-400/30">
        <strong>Test mode.</strong> Simulates a successful gift-card purchase.
      </div>
      <button onClick={pay} disabled={busy} className="mt-5 w-full rounded-full bg-accent px-6 py-4 text-lg font-bold text-ink transition hover:bg-accent-dark hover:text-ink disabled:opacity-60">
        {busy ? 'Processing…' : `Pay ${formatCents(amount)} (test)`}
      </button>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1">
      <header className="bg-brand-dark text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-bold">Whitetail Ridge Golf Dome</Link>
          <Link href="/book" className="text-sm text-white/80 hover:text-white">Book an event →</Link>
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-6 py-10">{children}</div>
    </main>
  )
}

const input = 'w-full rounded-lg border border-white/20 px-3 py-2 outline-none focus:border-brand'
function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-sm font-medium text-foreground/80">{children}</label>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-foreground/70">{label}</span>{children}</label>
}
