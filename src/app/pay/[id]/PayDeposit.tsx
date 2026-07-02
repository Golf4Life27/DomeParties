'use client'

import { useEffect, useState } from 'react'
import PaymentStep from '@/app/book/PaymentStep'

type PaymentInfo = { mode: 'dev' | 'stripe'; clientSecret: string | null; depositAmount: number }

export default function PayDeposit({ bookingId }: { bookingId: string }) {
  const [info, setInfo] = useState<PaymentInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/bookings/${bookingId}/pay`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (d.payment) setInfo({ ...d.payment, depositAmount: d.depositAmount })
        else setError(d.error ?? 'Could not start payment.')
      })
      .catch(() => setError('Could not start payment.'))
  }, [bookingId])

  if (error) return <p className="text-sm text-red-400">{error}</p>
  if (!info) return <p className="text-sm text-foreground/50">Loading secure payment…</p>

  return (
    <PaymentStep
      bookingId={bookingId}
      depositAmount={info.depositAmount}
      mode={info.mode}
      clientSecret={info.clientSecret}
    />
  )
}
