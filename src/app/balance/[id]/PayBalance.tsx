'use client'

import { useEffect, useState } from 'react'
import PaymentStep from '@/app/book/PaymentStep'

type PaymentInfo = { mode: 'dev' | 'stripe'; clientSecret: string | null; amount: number }

export default function PayBalance({ bookingId }: { bookingId: string }) {
  const [info, setInfo] = useState<PaymentInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/bookings/${bookingId}/pay-balance`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (d.payment) setInfo(d.payment)
        else setError(d.error ?? 'Could not start payment.')
      })
      .catch(() => setError('Could not start payment.'))
  }, [bookingId])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!info) return <p className="text-sm text-foreground/50">Loading secure payment…</p>

  return (
    <PaymentStep
      bookingId={bookingId}
      depositAmount={info.amount}
      mode={info.mode}
      clientSecret={info.clientSecret}
      label="balance"
      devConfirmPath={`/api/bookings/${bookingId}/confirm-balance-dev`}
      returnPath={`/balance/${bookingId}`}
    />
  )
}
