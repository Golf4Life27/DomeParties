'use client'

// Conversion tracking: fires to GA4 (gtag) and Meta Pixel (fbq) when their env
// IDs are configured; silently no-ops otherwise. Amounts in dollars.

type Gtag = (...args: unknown[]) => void
type Fbq = (...args: unknown[]) => void

declare global {
  interface Window {
    gtag?: Gtag
    fbq?: Fbq
  }
}

export function track(
  event: 'begin_checkout' | 'purchase' | 'generate_lead' | 'gift_purchase',
  params: { value?: number; currency?: string; reference?: string } = {},
) {
  const value = params.value
  const currency = params.currency ?? 'USD'
  try {
    if (typeof window === 'undefined') return
    window.gtag?.('event', event, {
      value,
      currency,
      transaction_id: params.reference,
    })
    if (window.fbq) {
      const fbEvent =
        event === 'purchase' || event === 'gift_purchase'
          ? 'Purchase'
          : event === 'generate_lead'
            ? 'Lead'
            : 'InitiateCheckout'
      window.fbq('track', fbEvent, { value, currency })
    }
  } catch {
    // never let analytics break the flow
  }
}
