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
  event: 'start_booking' | 'begin_checkout' | 'purchase' | 'generate_lead' | 'gift_purchase',
  params: { value?: number; currency?: string; reference?: string; eventId?: string } = {},
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
      // start_booking is the TOP of the booking funnel — the email step, before
      // any date or package is chosen. It exists because InitiateCheckout fires
      // one click before payment, which is far too rare to teach ad delivery
      // anything. Meta needs a frequent-but-real signal to optimize toward, and
      // this is it. Browser-only by design: Automatic Advanced Matching reads the
      // email straight off the form, so a server call would add latency to the
      // guest's first click and buy very little match quality.
      const fbEvent =
        event === 'purchase' || event === 'gift_purchase'
          ? 'Purchase'
          : event === 'generate_lead'
            ? 'Lead'
            : event === 'start_booking'
              ? 'CompleteRegistration'
              : 'InitiateCheckout'
      // eventId = the record's database id, and the server sends the same id via
      // the Conversions API — Meta dedupes the pair into one conversion.
      window.fbq('track', fbEvent, { value, currency }, params.eventId ? { eventID: params.eventId } : undefined)
    }
  } catch {
    // never let analytics break the flow
  }
}
