'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const STATUSES = ['NEW', 'CONTACTED', 'PROPOSAL_SENT', 'WON', 'LOST'] as const

export default function LeadActions({
  leadId,
  status,
  depositPercent,
  defaults,
}: {
  leadId: string
  status: string
  depositPercent: number
  defaults: { partySize: number; dateStr: string }
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  // quote form
  const [totalDollars, setTotalDollars] = useState('')
  const [dateStr, setDateStr] = useState(defaults.dateStr)
  const [hour, setHour] = useState('17')
  const [durationMinutes, setDuration] = useState('180')
  const [partySize, setPartySize] = useState(String(defaults.partySize))
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<{ payUrl: string; reference: string; baysAssigned: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function setStatus(s: string) {
    setBusy(true)
    await fetch(`/api/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: s }),
    })
    setBusy(false)
    router.refresh()
  }

  async function sendQuote(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const total = Math.round(parseFloat(totalDollars || '0') * 100)
    if (!total || !dateStr) {
      setError('Enter a total and a date.')
      return
    }
    setBusy(true)
    const res = await fetch(`/api/admin/leads/${leadId}/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        total,
        dateStr,
        startMinutes: parseInt(hour, 10) * 60,
        durationMinutes: parseInt(durationMinutes, 10),
        partySize: parseInt(partySize, 10),
        message: message || null,
      }),
    })
    setBusy(false)
    const data = await res.json()
    if (res.ok) {
      setResult({ payUrl: data.payUrl, reference: data.reference, baysAssigned: data.baysAssigned })
      router.refresh()
    } else {
      setError(data.error ?? 'Could not create quote.')
    }
  }

  const depositPreview = totalDollars
    ? `$${((parseFloat(totalDollars) * depositPercent) / 100).toFixed(2)}`
    : '—'

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h2 className="mb-3 font-semibold text-brand-dark">Status</h2>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              disabled={busy}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition ${
                status === s ? 'bg-brand text-white ring-brand' : 'bg-white ring-black/10 hover:ring-brand'
              }`}
            >
              {s.replace('_', ' ').toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h2 className="mb-1 font-semibold text-brand-dark">Send a quote</h2>
        <p className="mb-4 text-sm text-foreground/60">
          Creates a booking and emails the customer a deposit link ({depositPercent}% deposit).
        </p>

        {result ? (
          <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800 ring-1 ring-green-200">
            ✓ Quote <strong>{result.reference}</strong> sent. {result.baysAssigned ? 'Bays held.' : 'Bays not auto-held — coordinate manually.'}
            <div className="mt-2 break-all">
              Pay link: <a href={result.payUrl} className="underline" target="_blank" rel="noreferrer">{result.payUrl}</a>
            </div>
          </div>
        ) : (
          <form onSubmit={sendQuote} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Total ($)">
                <input type="number" step="0.01" min="0" value={totalDollars} onChange={(e) => setTotalDollars(e.target.value)} className={input} placeholder="2500.00" />
              </Field>
              <Field label={`Deposit (${depositPercent}%)`}>
                <div className="px-3 py-2 text-sm text-foreground/70">{depositPreview}</div>
              </Field>
              <Field label="Date">
                <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className={input} />
              </Field>
              <Field label="Start time">
                <select value={hour} onChange={(e) => setHour(e.target.value)} className={input}>
                  {Array.from({ length: 13 }, (_, i) => i + 9).map((h) => (
                    <option key={h} value={h}>{((h % 12) || 12)}:00 {h >= 12 ? 'PM' : 'AM'}</option>
                  ))}
                </select>
              </Field>
              <Field label="Duration (min)">
                <input type="number" value={durationMinutes} onChange={(e) => setDuration(e.target.value)} className={input} />
              </Field>
              <Field label="Party size">
                <input type="number" value={partySize} onChange={(e) => setPartySize(e.target.value)} className={input} />
              </Field>
            </div>
            <Field label="Note to customer (optional)">
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className={input} />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button disabled={busy} className="rounded-full bg-accent px-6 py-2.5 font-semibold text-brand-dark transition hover:bg-accent-dark hover:text-white disabled:opacity-60">
              {busy ? 'Sending…' : 'Create quote & email deposit link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

const input = 'w-full rounded-lg border border-black/15 px-3 py-2 outline-none focus:border-brand'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground/70">{label}</span>
      {children}
    </label>
  )
}
