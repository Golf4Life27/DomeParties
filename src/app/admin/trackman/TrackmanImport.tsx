'use client'

import { useState } from 'react'
import { minutesToLabel } from '@/lib/time'

type Conflict = {
  startMinutes: number
  endMinutes: number
  demand: number
  capacity: number
  ourBookings: { reference: string; bays: number }[]
}
type Result = { imported: number; skipped: string[]; conflicts: Conflict[] }

function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}

export default function TrackmanImport() {
  const [dateStr, setDateStr] = useState(todayStr())
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/trackman/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateStr, text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Import failed')
      } else {
        setResult(data)
      }
    } catch {
      setError('Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 max-w-2xl">
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground/80">Date</span>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="rounded-lg border border-black/15 px-3 py-2 outline-none focus:border-brand"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-medium text-foreground/80">
            Paste Trackman&apos;s bookings for this day
          </span>
          <span className="mb-2 block text-xs text-foreground/50">
            One reservation per line, e.g. <code className="rounded bg-black/5 px-1">1:30 PM - 3:30 PM</code>.
            Add <code className="rounded bg-black/5 px-1">x12</code> to mean 12 bays busy in that window:
            <code className="ml-1 rounded bg-black/5 px-1">2:00 PM - 4:00 PM x12</code>.
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={'1:30 PM - 3:30 PM x8\n4:00 PM - 6:00 PM x15\n6:00 PM - 9:00 PM x22'}
            className="w-full rounded-lg border border-black/15 px-3 py-2 font-mono text-sm outline-none focus:border-brand"
          />
        </label>

        <button
          onClick={run}
          disabled={busy || !text.trim()}
          className="mt-3 rounded-full bg-brand px-6 py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? 'Checking…' : 'Import & check for conflicts'}
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {result && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-foreground/70">
            Imported <strong>{result.imported}</strong> reservation{result.imported === 1 ? '' : 's'} for {dateStr}.
            {result.skipped.length > 0 && (
              <span className="text-amber-700">
                {' '}
                Skipped {result.skipped.length} line{result.skipped.length === 1 ? '' : 's'} I couldn&apos;t read.
              </span>
            )}
          </p>

          {result.conflicts.length === 0 ? (
            <div className="rounded-2xl bg-green-50 p-5 ring-1 ring-green-200">
              <p className="font-semibold text-green-800">✓ No conflicts</p>
              <p className="mt-1 text-sm text-green-800/80">
                Everything this system has booked fits alongside Trackman on {dateStr}.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-red-50 p-5 ring-1 ring-red-200">
              <p className="font-semibold text-red-800">
                ⚠ {result.conflicts.length} conflict window{result.conflicts.length === 1 ? '' : 's'} — over capacity
              </p>
              <ul className="mt-2 space-y-2 text-sm text-red-800/90">
                {result.conflicts.map((c, i) => (
                  <li key={i} className="rounded-lg bg-white/60 p-3">
                    <strong>
                      {minutesToLabel(c.startMinutes)}–{minutesToLabel(c.endMinutes)}
                    </strong>
                    : {c.demand} bays needed vs {c.capacity} available.
                    <br />
                    Your booking(s): {c.ourBookings.map((b) => `${b.reference} (${b.bays} bays)`).join(', ') || 'none'}.
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-red-800/80">
                Re-slot one side (here or in Trackman) before the event.
              </p>
            </div>
          )}

          {result.skipped.length > 0 && (
            <details className="text-xs text-foreground/50">
              <summary className="cursor-pointer">Show skipped lines</summary>
              <ul className="mt-2 space-y-0.5">
                {result.skipped.map((s, i) => (
                  <li key={i} className="font-mono">
                    {s}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
