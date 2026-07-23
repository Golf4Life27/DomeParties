'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// While a just-paid booking is still "finalizing" (the Stripe redirect beat the
// webhook), poll and refresh so the page flips to the confirmed/deposit-received
// state on its own instead of asking the customer to reload.
export default function AutoRefresh({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  useEffect(() => {
    let tries = 0
    const timer = setInterval(async () => {
      tries += 1
      try {
        const res = await fetch(`/api/bookings/${bookingId}`, { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        const b = data?.booking
        if (b && (b.status === 'CONFIRMED' || (b.status === 'PENDING' && b.depositPaid))) {
          clearInterval(timer)
          router.refresh()
        }
      } catch {
        // ignore; keep polling
      }
      if (tries >= 20) clearInterval(timer) // give up after ~1 min
    }, 3000)
    return () => clearInterval(timer)
  }, [bookingId, router])
  return null
}
