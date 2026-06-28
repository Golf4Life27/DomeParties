'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function BookingActions({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const [sentRecovery, setSentRecovery] = useState(false)

  async function act(action: 'cancel' | 'complete' | 'recover') {
    if (action === 'cancel' && !confirm('Cancel this booking and free its bays?')) return
    setBusy(true)
    const res = await fetch(`/api/admin/bookings/${id}/${action}`, { method: 'POST' })
    setBusy(false)
    if (action === 'recover') {
      if (res.ok) setSentRecovery(true)
      return
    }
    router.refresh()
  }

  const canCancel = status === 'CONFIRMED' || status === 'PENDING'
  const canComplete = status === 'CONFIRMED'
  const canRecover = status === 'DRAFT'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canRecover && (
        <button
          onClick={() => act('recover')}
          disabled={busy || sentRecovery}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-brand-dark transition hover:bg-accent-dark hover:text-white disabled:opacity-60"
        >
          {sentRecovery ? '✓ Recovery sent' : 'Send recovery email'}
        </button>
      )}
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
