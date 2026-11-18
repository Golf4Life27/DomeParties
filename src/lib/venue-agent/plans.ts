import { PILOT } from './pilot'

// What an owner pays, in the currency their venue charges in. The same two
// plans everywhere, first month free: Starter is the chat on its own, Pro also
// keeps their party prices up to date for them each month. Prices outside the
// US are the dollar price at the Nov 17, 2026 exchange rate, rounded to a price
// that looks local (decision 62). The pilot offer is US only (decision 48).

export type PlanId = 'starter' | 'pro' | 'pilot'

const MONTHLY: Record<string, { starter: number; pro: number }> = {
  USD: { starter: 299, pro: 499 },
  GBP: { starter: 229, pro: 379 },
  EUR: { starter: 269, pro: 449 },
  AUD: { starter: 449, pro: 749 },
}

/** The currency an owner is billed in: their venue's own when we price in it, otherwise US dollars. */
export function billingCurrency(venueCurrency: string): string {
  return MONTHLY[venueCurrency] ? venueCurrency : 'USD'
}

function money(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

export type PlanOffer = { id: PlanId; name: string; price: string; line: string }

/** The plans to show an owner, in the order shown. The pilot appears only when the owner came from a pilot email, and only in US dollars. */
export function planOffers(venueCurrency: string, locale: string, pilot = false): PlanOffer[] {
  const cur = billingCurrency(venueCurrency)
  const m = MONTHLY[cur]
  const loc = cur === 'USD' ? 'en-US' : locale
  const note = cur === 'AUD' ? ' (Australian dollars)' : ''
  const pro: PlanOffer = {
    id: 'pro',
    name: 'Pro',
    price: `${money(m.pro, cur, loc)} a month${note}`,
    line: 'The chat, and we keep your party prices up to date for you each month. First month free.',
  }
  const starter: PlanOffer = {
    id: 'starter',
    name: 'Starter',
    price: `${money(m.starter, cur, loc)} a month${note}`,
    line: 'The chat on its own. First month free.',
  }
  if (!pilot || cur !== 'USD') return [pro, starter]
  return [
    {
      id: 'pilot',
      name: '60-day pilot',
      price: 'Nothing up front',
      line: `For the first ${PILOT.days} days you pay ${money(PILOT.perRequestCents / 100, 'USD', 'en-US')} for each party request the chat takes for you, and never more than ${money(PILOT.monthlyCapCents / 100, 'USD', 'en-US')} a month. After that you pick Pro or Starter.`,
    },
    pro,
    starter,
  ]
}
