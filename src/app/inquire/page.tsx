'use client'

import { useState } from 'react'
import Link from 'next/link'

const EVENT_TYPES = [
  { key: 'CORPORATE', label: '💼 Corporate / team' },
  { key: 'LEAGUE', label: '🏆 League' },
  { key: 'BACHELOR', label: '🥂 Bachelor(ette)' },
  { key: 'GROUP', label: '🎉 Large group' },
  { key: 'OTHER', label: '✨ Something else' },
]
const BUDGETS = ['Under $1,000', '$1,000–$2,500', '$2,500–$5,000', '$5,000–$10,000', '$10,000+', 'Not sure yet']
const MUST_HAVES = ['Private space', 'Full bar', 'Catered food', 'AV / presentation', 'Décor', 'Photographer']

export default function InquirePage() {
  const [eventType, setEventType] = useState('CORPORATE')
  const [preferredDate, setPreferredDate] = useState('')
  const [dateFlexible, setDateFlexible] = useState(false)
  const [headcountMin, setHeadcountMin] = useState('')
  const [headcountMax, setHeadcountMax] = useState('')
  const [budget, setBudget] = useState('')
  const [mustHaves, setMustHaves] = useState<string[]>([])
  const [customerName, setName] = useState('')
  const [customerEmail, setEmail] = useState('')
  const [customerPhone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function toggleMust(m: string) {
    setMustHaves((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!customerName.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail)) {
      setError('Please enter your name and a valid email.')
      return
    }
    setBusy(true)
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType,
        preferredDate: preferredDate || null,
        dateFlexible,
        headcountMin: headcountMin ? parseInt(headcountMin, 10) : null,
        headcountMax: headcountMax ? parseInt(headcountMax, 10) : null,
        budget: budget || null,
        mustHaves,
        customerName,
        customerEmail,
        customerPhone: customerPhone || null,
        message: message || null,
      }),
    })
    setBusy(false)
    if (res.ok) setDone(true)
    else setError('Something went wrong. Please try again or call us.')
  }

  return (
    <main className="flex-1">
      <header className="bg-brand-dark text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-bold">Whitetail Ridge Golf Dome</Link>
          <Link href="/book" className="text-sm text-white/80 hover:text-white">Instant book →</Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-10">
        {done ? (
          <div className="rounded-2xl bg-surface p-8 text-center shadow-sm ring-1 ring-white/10">
            <div className="text-5xl">🎉</div>
            <h1 className="mt-4 text-2xl font-bold text-brand">Request received!</h1>
            <p className="mt-2 text-foreground/70">
              Check your inbox — we just sent a confirmation. Our events team will follow up
              shortly with a custom proposal (usually within one business day).
            </p>
            <Link href="/" className="mt-6 inline-block text-sm font-medium text-brand hover:underline">
              ← Back to home
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="animate-fade-up">
            <h1 className="text-3xl font-bold text-brand">Request a custom quote</h1>
            <p className="mt-1 text-foreground/60">
              For corporate outings, leagues, big groups, and custom events. Takes a minute —
              we&apos;ll reply fast.
            </p>

            <div className="mt-6 space-y-6 rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-white/10">
              <div>
                <Label>Event type</Label>
                <div className="flex flex-wrap gap-2">
                  {EVENT_TYPES.map((e) => (
                    <button
                      type="button"
                      key={e.key}
                      onClick={() => setEventType(e.key)}
                      className={`rounded-full px-4 py-2 text-sm font-medium ring-1 transition ${
                        eventType === e.key ? 'bg-brand text-ink ring-brand' : 'bg-surface ring-white/15 hover:ring-brand'
                      }`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Preferred date</Label>
                  <input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} className={input} />
                  <label className="mt-2 flex items-center gap-2 text-sm text-foreground/70">
                    <input type="checkbox" checked={dateFlexible} onChange={(e) => setDateFlexible(e.target.checked)} />
                    My dates are flexible
                  </label>
                </div>
                <div>
                  <Label>Estimated headcount</Label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" placeholder="Min" value={headcountMin} onChange={(e) => setHeadcountMin(e.target.value)} className={input} />
                    <span className="text-foreground/40">–</span>
                    <input type="number" min="1" placeholder="Max" value={headcountMax} onChange={(e) => setHeadcountMax(e.target.value)} className={input} />
                  </div>
                </div>
              </div>

              <div>
                <Label>Budget range</Label>
                <select value={budget} onChange={(e) => setBudget(e.target.value)} className={input}>
                  <option value="">Select a range (optional)</option>
                  {BUDGETS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <div>
                <Label>Must-haves</Label>
                <div className="flex flex-wrap gap-2">
                  {MUST_HAVES.map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => toggleMust(m)}
                      className={`rounded-full px-3 py-1.5 text-sm ring-1 transition ${
                        mustHaves.includes(m) ? 'bg-brand text-ink ring-brand' : 'bg-surface ring-white/15 hover:ring-brand'
                      }`}
                    >
                      {mustHaves.includes(m) ? '✓ ' : ''}{m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Your name</Label>
                  <input value={customerName} onChange={(e) => setName(e.target.value)} className={input} placeholder="Jordan Smith" />
                </div>
                <div>
                  <Label>Email</Label>
                  <input type="email" value={customerEmail} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="you@email.com" />
                </div>
                <div>
                  <Label>Phone (optional)</Label>
                  <input value={customerPhone} onChange={(e) => setPhone(e.target.value)} className={input} placeholder="(555) 555-5555" />
                </div>
              </div>

              <div>
                <Label>Anything else?</Label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className={input} placeholder="Tell us about your event…" />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button
                disabled={busy}
                className="w-full rounded-full bg-accent px-6 py-4 text-lg font-bold text-ink shadow transition hover:bg-accent-dark hover:text-ink disabled:opacity-60"
              >
                {busy ? 'Sending…' : 'Send my request →'}
              </button>
              <p className="text-center text-xs text-foreground/50">
                Prefer to book instantly? <Link href="/book" className="text-brand hover:underline">Book a standard package →</Link>
              </p>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}

const input = 'w-full rounded-lg border border-white/20 px-4 py-3 outline-none focus:border-brand'

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-sm font-medium text-foreground/80">{children}</label>
}
