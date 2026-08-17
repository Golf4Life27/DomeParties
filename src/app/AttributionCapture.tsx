'use client'

import { useEffect } from 'react'
import { ATTR_COOKIE, ATTR_MAX_AGE } from '@/lib/attribution'

/**
 * Writes the first-touch attribution cookie when a visit lands with utm_* or
 * fbclid in the URL. Mounted once in the root layout.
 *
 * First-touch: if the cookie already exists it is left alone, so an ad click
 * followed by three organic returns still credits the ad. Nothing is sent
 * anywhere — this only pins the values so /api/leads and /api/bookings can copy
 * them onto the record they create.
 */
export default function AttributionCapture() {
  useEffect(() => {
    try {
      if (document.cookie.split('; ').some((c) => c.startsWith(`${ATTR_COOKIE}=`))) return
      const q = new URLSearchParams(window.location.search)
      const payload = {
        s: q.get('utm_source') ?? undefined,
        m: q.get('utm_medium') ?? undefined,
        c: q.get('utm_campaign') ?? undefined,
        n: q.get('utm_content') ?? undefined,
        f: q.get('fbclid') ?? undefined,
        lp: window.location.pathname,
      }
      // Only pin a visit that is actually attributable — a bare organic landing
      // shouldn't burn the first-touch slot before a later ad click.
      if (!payload.s && !payload.f) return
      const secure = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `${ATTR_COOKIE}=${encodeURIComponent(JSON.stringify(payload))}; Max-Age=${ATTR_MAX_AGE}; Path=/; SameSite=Lax${secure}`
    } catch {
      // attribution must never break a page
    }
  }, [])
  return null
}
