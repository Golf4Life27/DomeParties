import { fitsHours, hoursOn, isPeak, weekdayOf } from './clock'
import { formatMoney, percentOf, toMinor } from './money'
import type { VenueProfile } from './profile'

// The one place a venue's price is worked out. The agent never does sums
// itself: it asks this and repeats what comes back.

export type QuoteRequest = {
  packageId: string
  guests: number
  date: string | null
  start: string | null
  foodId: string | null
  /** Guests eating; defaults to everyone. */
  foodGuests: number | null
  addOns: { id: string; quantity: number }[]
}

export type QuoteLine = { item: string; detail: string; amount: number }

export type Quote = {
  lines: QuoteLine[]
  subtotal: number
  serviceCharge: number
  tax: number
  total: number
  deposit: number | null
  balance: number | null
  peak: boolean
  /** True when the date or time wasn't given, so peak pricing couldn't be checked. */
  estimate: boolean
  units: number | null
}

export class QuoteError extends Error {}

export function unitsFor(p: VenueProfile, guests: number, minUnits = 1): number {
  return Math.max(minUnits, Math.ceil(guests / p.unit.guestsPerUnit))
}

export function quote(p: VenueProfile, r: QuoteRequest): Quote {
  const c = p.currency
  const pkg = p.packages.find((x) => x.id === r.packageId)
  if (!pkg) throw new QuoteError(`Unknown package "${r.packageId}"`)
  if (r.guests < pkg.minGuests || r.guests > pkg.maxGuests) {
    throw new QuoteError(`${pkg.name} is for ${pkg.minGuests} to ${pkg.maxGuests} guests`)
  }
  if (r.date) {
    const day = hoursOn(p, r.date)
    if (day.closed) throw new QuoteError(`Closed on ${r.date}${day.note ? ` (${day.note})` : ''}`)
    if (pkg.days.length && !pkg.days.includes(weekdayOf(r.date))) {
      throw new QuoteError(`${pkg.name} isn't offered on that day of the week`)
    }
    if (r.start && !fitsHours(p, r.date, r.start, pkg.durationMinutes)) {
      throw new QuoteError(`A ${pkg.durationMinutes / 60}-hour party starting at ${r.start} doesn't fit the opening hours that day`)
    }
  }

  const peak = r.date ? isPeak(p, r.date, r.start) : false
  const rate = peak && pkg.pricing.peakAmount != null ? pkg.pricing.peakAmount : pkg.pricing.amount
  const hours = pkg.durationMinutes / 60
  const lines: QuoteLine[] = []
  let units: number | null = null

  if (pkg.pricing.type === 'flat') {
    lines.push({ item: pkg.name, detail: `flat, up to ${pkg.maxGuests} guests`, amount: toMinor(rate, c) })
  } else if (pkg.pricing.type === 'per_person') {
    lines.push({ item: pkg.name, detail: `${r.guests} guests`, amount: toMinor(rate, c) * r.guests })
  } else {
    units = unitsFor(p, r.guests, pkg.pricing.minUnits)
    if (units > p.unit.count) throw new QuoteError(`That needs ${units} ${p.unit.plural}; the venue has ${p.unit.count}`)
    lines.push({
      item: pkg.name,
      detail: `${units} ${units === 1 ? p.unit.singular : p.unit.plural} for ${hours} h`,
      amount: Math.round(toMinor(rate, c) * units * hours),
    })
  }

  let foodTotal = 0
  if (r.foodId) {
    const f = p.food.find((x) => x.id === r.foodId)
    if (!f) throw new QuoteError(`Unknown food "${r.foodId}"`)
    const eaters = r.foodGuests ?? r.guests
    foodTotal = f.pricing === 'per_person' ? toMinor(f.amount, c) * eaters : toMinor(f.amount, c)
    lines.push({ item: f.name, detail: f.pricing === 'per_person' ? `${eaters} guests` : 'flat', amount: foodTotal })
  }

  for (const a of r.addOns) {
    const add = p.addOns.find((x) => x.id === a.id)
    if (!add) throw new QuoteError(`Unknown add-on "${a.id}"`)
    const qty = add.unit === 'per_person' ? r.guests * a.quantity : a.quantity
    lines.push({ item: add.name, detail: add.unit === 'per_person' ? `${r.guests} guests` : `x${a.quantity}`, amount: toMinor(add.amount, c) * qty })
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const sc = p.serviceCharge
  const scBase = sc.appliesTo === 'all' ? subtotal : sc.appliesTo === 'with_food' ? (r.foodId ? subtotal : 0) : foodTotal
  const serviceCharge = percentOf(scBase, sc.percent)
  const tax = percentOf(subtotal + (p.taxOnServiceCharge ? serviceCharge : 0), p.taxPercent)
  const total = subtotal + serviceCharge + tax

  let deposit: number | null = null
  if (p.deposit.flat != null) deposit = Math.min(total, toMinor(p.deposit.flat, c))
  else if (p.deposit.percent != null) deposit = percentOf(total, p.deposit.percent)

  return {
    lines,
    subtotal,
    serviceCharge,
    tax,
    total,
    deposit,
    balance: deposit == null ? null : total - deposit,
    peak,
    estimate: !r.date || (p.peak.from != null && !r.start),
    units,
  }
}

/** The quote written out for the agent, in the venue's money. */
export function describeQuote(p: VenueProfile, q: Quote) {
  const m = (n: number) => formatMoney(n, p.currency, p.locale)
  return {
    lines: q.lines.map((l) => ({ item: l.item, detail: l.detail, amount: m(l.amount) })),
    subtotal: m(q.subtotal),
    service_charge: q.serviceCharge ? m(q.serviceCharge) : null,
    tax: q.tax ? m(q.tax) : null,
    total: m(q.total),
    deposit: q.deposit == null ? null : m(q.deposit),
    balance_later: q.balance == null ? null : m(q.balance),
    peak_pricing: q.peak,
    estimate_only: q.estimate,
  }
}
