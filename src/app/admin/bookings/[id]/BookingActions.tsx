'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Slot = { startMinutes: number; label: string; availableBays: number }

/** Minutes-from-midnight ↔ the "HH:MM" an <input type="time"> speaks. */
function toTimeValue(minutes: number): string {
  const m = Math.max(0, Math.min(1439, minutes))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
function fromTimeValue(value: string): number {
  const [h, m] = value.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

export default function BookingActions({
  id,
  status,
  needsReview,
  depositPaid,
  balancePaid,
  balanceDue,
  dateStr,
  startMinutes,
}: {
  id: string
  status: string
  needsReview?: boolean
  depositPaid?: boolean
  balancePaid?: boolean
  balanceDue?: number
  dateStr: string
  startMinutes: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const [sentRecovery, setSentRecovery] = useState(false)
  const [refundNote, setRefundNote] = useState<string | null>(null)

  // Reschedule panel. Hidden until asked for — moving a booked event is a
  // deliberate act, not something to leave one stray click away.
  const [showMove, setShowMove] = useState(false)
  const [moveDate, setMoveDate] = useState(dateStr)
  const [moveStart, setMoveStart] = useState(String(startMinutes))
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [notifyGuest, setNotifyGuest] = useState(true)
  const [moveNote, setMoveNote] = useState<string | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)

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
      // A booking can carry two charges — deposit and balance — so this reports
      // each one. Saying plainly whether Stripe actually took it matters: a silent
      // failure here is how a guest ends up cancelled and out of pocket.
      type RefundLine = { kind: string; ok: boolean; amount?: number; reason?: string }
      const lines: RefundLine[] = Array.isArray(data?.refunds) ? data.refunds : []
      const failed = lines.filter((r) => !r.ok)
      if (data?.refunded > 0) {
        const detail = lines
          .filter((r) => r.ok)
          .map((r) => `${r.kind} ${money(r.amount ?? 0)}`)
          .join(' + ')
        setRefundNote(
          `Refunded ${money(data.refunded)} in Stripe (${detail}).` +
            (data.refundOwed > 0
              ? ` ${money(data.refundOwed)} still needs refunding by hand — ${
                  failed.map((r) => `${r.kind}: ${r.reason}`).join('; ') || 'see the booking'
                }.`
              : ''),
        )
      } else {
        setRefundNote(
          `Cancelled, but nothing was refunded: ${
            failed.map((r) => `${r.kind} — ${r.reason}`).join('; ') || 'unknown error'
          }. Refund it manually in Stripe.`,
        )
      }
    }
    setBusy(false)
    if (action === 'recover') {
      if (res.ok) setSentRecovery(true)
      return
    }
    router.refresh()
  }

  /** Load the start times that would actually fit this booking on `d`. */
  async function loadSlots(d: string) {
    setSlots(null)
    setMoveError(null)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return
    const res = await fetch(`/api/admin/bookings/${id}/reschedule?date=${d}`)
    const data = await res.json().catch(() => null)
    setSlots(Array.isArray(data?.slots) ? data.slots : [])
  }

  async function submitMove() {
    setMoveError(null)
    setMoveNote(null)
    setBusy(true)
    const res = await fetch(`/api/admin/bookings/${id}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: moveDate,
        startMinutes: Number(moveStart),
        notifyGuest,
      }),
    })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok || !data?.ok) {
      // Nothing was moved — say why, and leave the panel open so it can be retried.
      setMoveError(data?.error ?? 'Could not reschedule.')
      return
    }
    // Report the price difference rather than acting on it: the move is done, and
    // whether to charge or credit the gap is a judgement call, not a default.
    const delta: number | null = data.priceDelta ?? null
    const priceLine =
      delta === null
        ? ' Price on the new date could not be recalculated — check it by hand.'
        : delta === 0
          ? ' Prices the same on the new date.'
          : ` The new date prices ${money(Math.abs(delta))} ${delta > 0 ? 'HIGHER' : 'LOWER'} — nothing was charged or credited.`
    const warnings: string[] = Array.isArray(data.warnings) ? data.warnings : []
    setMoveNote(
      `Moved ${data.previousDateStr} → ${data.dateStr}.${priceLine}` +
        (data.guestNotified ? ' Guest emailed with a new invite.' : ' Guest was NOT emailed.') +
        (warnings.length ? ` ${warnings.join(' ')}` : ''),
    )
    setShowMove(false)
    router.refresh()
  }

  const canApprove = status === 'PENDING' && needsReview && depositPaid
  const canMarkBalance = (status === 'CONFIRMED' || status === 'COMPLETED') && !balancePaid && (balanceDue ?? 0) > 0
  const canCancel = status === 'CONFIRMED' || status === 'PENDING'
  // Same states as cancel: anything holding bays can be moved instead of killed.
  const canReschedule = status === 'CONFIRMED' || status === 'PENDING'
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
      {canReschedule && (
        <button
          onClick={() => {
            setShowMove((s) => !s)
            setMoveNote(null)
            if (!showMove && slots === null) loadSlots(moveDate)
          }}
          disabled={busy}
          className="rounded-full px-4 py-2 text-sm font-medium text-brand ring-1 ring-brand/30 transition hover:bg-brand/5 disabled:opacity-60"
        >
          📅 Reschedule
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

      {showMove && (
        <div className="mt-3 w-full rounded-xl bg-brand-light/60 p-4 ring-1 ring-brand/15">
          <p className="text-sm font-semibold text-brand-dark">
            Move this event — the deposit, reference and everything paid stay as they are.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-brand-dark">
              New date
              <input
                type="date"
                value={moveDate}
                onChange={(e) => {
                  setMoveDate(e.target.value)
                  loadSlots(e.target.value)
                }}
                className="mt-1 block rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand-dark"
              />
            </label>
            {/* Free text rather than a dropdown of free slots: staff legitimately
                place events on days we never sell online, where the slot list is
                empty. The chips below are the shortcut; this is the escape hatch. */}
            <label className="text-xs font-medium text-brand-dark">
              Start time
              <input
                type="time"
                step={300}
                value={toTimeValue(Number(moveStart))}
                onChange={(e) => setMoveStart(String(fromTimeValue(e.target.value)))}
                className="mt-1 block rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand-dark"
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-xs font-medium text-brand-dark">
              <input
                type="checkbox"
                checked={notifyGuest}
                onChange={(e) => setNotifyGuest(e.target.checked)}
              />
              Email the guest a new invite
            </label>
            <button
              onClick={submitMove}
              disabled={busy}
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {busy ? 'Moving…' : 'Move event'}
            </button>
          </div>
          {slots !== null && slots.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-brand-dark/70">
                Free that day (bays available):
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {slots.map((s) => (
                  <button
                    key={s.startMinutes}
                    type="button"
                    onClick={() => setMoveStart(String(s.startMinutes))}
                    className={`rounded-full px-2.5 py-1 text-xs ring-1 transition ${
                      Number(moveStart) === s.startMinutes
                        ? 'bg-brand text-white ring-brand'
                        : 'bg-white text-brand-dark ring-brand/20 hover:ring-brand'
                    }`}
                  >
                    {s.label} · {s.availableBays}
                  </button>
                ))}
              </div>
            </div>
          )}
          {slots !== null && slots.length === 0 && (
            <p className="mt-2 text-xs text-brand-dark/70">
              No free slots that day — we may not host events then, or it&apos;s full. You can still
              enter a time: staff moves aren&apos;t held to the online rules, and the move is refused
              only if the bays genuinely clash.
            </p>
          )}
          {moveError && <p className="mt-2 text-sm font-medium text-red-700">{moveError}</p>}
        </div>
      )}
      {moveNote && <p className="mt-2 w-full text-sm font-medium text-brand-dark">{moveNote}</p>}
    </div>
  )
}
