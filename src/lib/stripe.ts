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
