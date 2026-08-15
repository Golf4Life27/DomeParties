'use client'

import { useEffect } from 'react'
import { track } from '@/lib/track'

// Fires the purchase conversion once per confirmation view (sessionStorage guard
// prevents double-counting on refresh). bookingId doubles as the Meta event id:
// the payment webhook sends the same id server-side, and Meta dedupes the pair.
export default function TrackPurchase({
  value,
  reference,
  bookingId,
}: {
  value: number
  reference: string
  bookingId: string
}) {
  useEffect(() => {
    const key = `tracked-${reference}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    track('purchase', { value, reference, eventId: bookingId })
  }, [value, reference, bookingId])
  return null
}
