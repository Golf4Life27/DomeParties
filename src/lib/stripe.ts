import Stripe from 'stripe'

// Returns a configured Stripe client, or null when no key is set.
// Null enables the dev "simulated deposit" path so the full flow is testable
// before Alex wires the Dome's Stripe test keys.
let cached: Stripe | null | undefined

export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached
  const key = process.env.STRIPE_SECRET_KEY
  cached = key ? new Stripe(key) : null
  return cached
}

export function isStripeLive(): boolean {
  return getStripe() !== null
}

/**
 * What we offer at checkout — pinned here rather than left to whatever the
 * Stripe dashboard has enabled.
 *
 * Instant settlement only, and that is the whole point. Left unset, Stripe
 * offers every active method on the account, which includes ACH bank debit —
 * and ACH settles in days, not seconds. A guest paying by ACH would finish
 * checkout, land on the confirmation page, and their booking would still be
 * PENDING when releaseExpiredHolds() freed the bays 30 minutes later. The late
 * payment is handled (confirmPaid re-assigns bays under the date lock and routes
 * to review rather than double-booking) but there is no reason to invite it.
 *
 * Buy-now-pay-later (Klarna, Affirm, Afterpay) is active on the account but
 * deliberately excluded: higher cost on a deposit this size, and refunds are
 * messier when a third party is fronting the money.
 *
 * Adding a method here is a code change on purpose — an accidental dashboard
 * toggle should not be able to change how party deposits are collected.
 */
export const PAYMENT_METHOD_TYPES: Stripe.PaymentIntentCreateParams['payment_method_types'] = [
  'card',
  'link',
  'cashapp',
  'amazon_pay',
]
