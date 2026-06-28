'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function BookingActions({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function act(action: 'cancel' | 'complete') {
    if (action === 'cancel' && !confirm('Cancel this booking and free its bays?')) return
    setBusy(true)
    await fetch(`/api/admin/bookings/${id}/${action}`, { method: 'POST' })
    setBusy(false)
    router.refresh()
  }

  const canCancel = status === 'CONFIRMED' || status === 'PENDING'
  const canComplete = status === 'CONFIRMED'

  return (
    <div className="flex gap-2">
      {canComplete && (
        <button
          onClick={() => act('complete')}
          disabled={busy}
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          Mark completed
        </button>
      )}
      {canCancel && (
        <button
          onClick={() => act('cancel')}
          disabled={busy}
          className="rounded-full px-4 py-2 text-sm font-medium text-red-700 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-60"
        >
          Cancel booking
        </button>
      )}
    </div>
  )
}
