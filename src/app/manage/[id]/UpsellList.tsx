'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { formatCents } from '@/lib/money'

type Item = {
  id: string
  name: string
  description: string
  category: string
  price: number
  unit: 'FLAT' | 'PER_PERSON' | 'PER_30_MIN'
  already: number
}

export default function UpsellList({
  bookingId,
  partySize,
  addOns,
}: {
  bookingId: string
  partySize: number
  addOns: Item[]
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function add(a: Item) {
    setBusyId(a.id)
    setError(null)
    const res = await fetch(`/api/bookings/${bookingId}/add-addon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addOnId: a.id, quantity: 1 }),
    })
    setBusyId(null)
    if (res.ok) router.refresh()
    else {
      const d = await res.json().catch(() => null)
      setError(d?.error ?? 'Could not add — please call us.')
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      {addOns.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-xl border border-black/10 bg-white p-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{a.name}</span>
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-foreground/60">{a.category}</span>
              {a.already > 0 && (
                <span className="rounded-full bg-brand-light px-2 py-0.5 text-xs font-medium text-brand-dark">
                  ✓ on your booking{a.already > 1 ? ` ×${a.already}` : ''}
                </span>
              )}
            </div>
            <p className="text-sm text-foreground/70">{a.description}</p>
            <p className="mt-1 text-sm font-semibold text-brand-dark">
              {a.unit === 'PER_PERSON'
                ? `${formatCents(a.price)} /guest (${formatCents(a.price * partySize)} for your group)`
                : formatCents(a.price)}
            </p>
          </div>
          <button
            onClick={() => add(a)}
            disabled={busyId === a.id}
            className="rounded-full bg-black/5 px-4 py-2 text-sm font-semibold transition hover:bg-brand hover:text-white disabled:opacity-60"
          >
            {busyId === a.id ? 'Adding…' : a.already > 0 ? '+ Add another' : 'Add'}
          </button>
        </div>
      ))}
    </div>
  )
}
