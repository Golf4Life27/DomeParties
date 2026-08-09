'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function BookingActions({
  id,
  status,
  needsReview,
  depositPaid,
  balancePaid,
  balanceDue,
}: {
  id: string
  status: string
  needsReview?: boolean
  depositPaid?: boolean
  balancePaid?: boolean
  balanceDue?: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const [sentRecovery, setSentRecovery] = useState(false)
  const [refundNote, setRefundNote] = useState<string | null>(null)

  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`
  // Has the guest actually handed over money that would be owed back?
  const hasCollected = Boolean(depositPaid || balancePaid)

  async function act(
    action: 'cancel' | 'complete' | 'recover' | 'approve' | 'mark-balance-paid',
    body?: Record<string, unknown>,
  ) {
    if (action === 'cancel' && !body?.refund && !confirm('Cancel this booking and free its bays?')) return
    if (action === 'mark-balance-paid' && !confirm('Record the remaining balance as paid at the venue? The guest gets a receipt email.')) return
    setBusy(true)
    const res = await fetch(`/api/admin/bookings/${id}/${action}`, {
      method: 'POST',
      ...(body
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    })
    if (action === 'cancel' && body?.refund) {
      const data = await res.json().catch(() => null)
      // Say plainly whether Stripe actually took it — a silent failure here is
      // how a guest ends up cancelled and out of pocket.
      if (data?.refund?.ok) {
        // Say what's left as well as what went back — a balance paid ahead was
        // taken on a payment this booking never recorded, so it can't go back here.
        setRefundNote(
          `Refunded ${money(data.refund.amount)} in Stripe.` +
            (data.refundOwed > 0
              ? ` ${money(data.refundOwed)} of balance paid ahead still needs refunding by hand.`
              : ''),
        )
      } else {
        setRefundNote(`Cancelled, but the refund did NOT go through: ${data?.refund?.reason ?? 'unknown error'}. Refund it manually in Stripe.`)
      }
    }
    setBusy(false)
    if (action === 'recover') {
      if (res.ok) setSentRecovery(true)
      return
    }
    router.refresh()
  }

  const canApprove = status === 'PENDING' && needsReview && depositPaid
  const canMarkBalance = (status === 'CONFIRMED' || status === 'COMPLETED') && !balancePaid && (balanceDue ?? 0) > 0
  const canCancel = status === 'CONFIRMED' || status === 'PENDING'
  const canComplete = status === 'CONFIRMED'
  const canRecover = status === 'DRAFT'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canApprove && (
        <button
          onClick={() => act('approve')}
          disabled={busy}
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          ✓ Confirm (checked Trackman)
        </button>
      )}
      {canMarkBalance && (
        <button
          onClick={() => act('mark-balance-paid')}
          disabled={busy}
          className="rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
        >
          $ Mark balance paid (at venue)
        </button>
      )}
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
      {canCancel && hasCollected && (
        <button
          onClick={() => {
            if (!confirm('Cancel this booking, free its bays, AND refund the guest in Stripe?')) return
            act('cancel', { refund: true })
          }}
          disabled={busy}
          className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          Cancel &amp; refund
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
      {refundNote && (
        <p className="mt-2 w-full text-sm font-medium text-red-700">{refundNote}</p>
      )}
    </div>
  )
}
