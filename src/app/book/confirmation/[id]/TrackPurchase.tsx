'use client'

import { useEffect } from 'react'
import { track } from '@/lib/track'

// Fires the purchase conversion once per confirmation view (sessionStorage guard
// prevents double-counting on refresh).
export default function TrackPurchase({ value, reference }: { value: number; reference: string }) {
  useEffect(() => {
    const key = `tracked-${reference}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    track('purchase', { value, reference })
  }, [value, reference])
  return null
}
