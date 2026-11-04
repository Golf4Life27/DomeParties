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
  /** Hours wanted, for packages priced by the hour. Null means the package's own length. */
  hours?: number | null
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
  /** Packages in it whose website price is only a starting price. */
  fromPrices: string[]
}

export class QuoteError extends Error {}

export function unitsFor(p: VenueProfile, guests: number, minUnits = 1, guestsPerUnit: number | null = null): number {
  return Math.max(minUnits, Math.ceil(guests / (guestsPerUnit ?? p.unit.guestsPerUnit)))
}

export function quote(p: VenueProfile, r: QuoteRequest): Quote {
  const c = p.currency
  const pkg = p.packages.find((x) => x.id === r.packageId)
  if (!pkg) throw new QuoteError(`Unknown package "${r.packageId}"`)
  if (!pkg.priceListed) {
    throw new QuoteError(
      `The venue doesn't list a price for ${pkg.name} online. Don't give or guess a number: offer to pass the guest's details to the team for a quote.`,
    )
  }
  if (r.guests < pkg.minGuests || r.guests > pkg.maxGuests) {
    throw new QuoteError(`${pkg.name} is for ${pkg.minGuests} to ${pkg.maxGuests} guests`)
  }
  const baseHours = pkg.durationMinutes / 60
  if (r.hours != null && r.hours !== baseHours && pkg.pricing.type !== 'per_unit_hour') {
    throw new QuoteError(`${pkg.name} is a set ${baseHours}-hour package`)
  }
  const hours = pkg.pricing.type === 'per_unit_hour' && r.hours != null ? r.hours : baseHours
  if (hours < baseHours) throw new QuoteError(`${pkg.name} is booked for at least ${baseHours} hours`)
  if (r.date) {
    const day = hoursOn(p, r.date)
    if (day.closed) throw new QuoteError(`Closed on ${r.date}${day.note ? ` (${day.note})` : ''}`)
    if (pkg.days.length && !pkg.days.includes(weekdayOf(r.date))) {
      throw new QuoteError(`${pkg.name} isn't offered on that day of the week`)
    }
    if (r.start && !fitsHours(p, r.date, r.start, hours * 60)) {
      throw new QuoteError(`A ${hours}-hour party starting at ${r.start} doesn't fit the opening hours that day`)
    }
  }

  const peak = r.date ? isPeak(p, r.date, r.start) : false
  const rate = peak && pkg.pricing.peakAmount != null ? pkg.pricing.peakAmount : pkg.pricing.amount
  const lines: QuoteLine[] = []
  let units: number | null = null

  if (pkg.pricing.type === 'flat') {
    lines.push({ item: pkg.name, detail: `flat, up to ${pkg.maxGuests} guests`, amount: toMinor(rate, c) })
  } else if (pkg.pricing.type === 'per_person') {
    lines.push({ item: pkg.name, detail: `${r.guests} guests`, amount: toMinor(rate, c) * r.guests })
  } else {
    const own = pkg.pricing.guestsPerUnit
    units = unitsFor(p, r.guests, pkg.pricing.minUnits, own)
    if (own == null && p.unit.count != null && units > p.unit.count) throw new QuoteError(`That needs ${units} ${p.unit.plural}; the venue has ${p.unit.count}`)
    lines.push({
      item: pkg.name,
      detail: own != null ? `${units === 1 ? '' : `${units} bookings, `}${hours} h` : `${units} ${units === 1 ? p.unit.singular : p.unit.plural} for ${hours} h`,
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
    estimate: !r.date || (p.peak.from != null && !r.start && p.peak.days.includes(weekdayOf(r.date)) && !p.peak.allDay.includes(weekdayOf(r.date))),
    units,
    fromPrices: pkg.priceFrom ? [pkg.name] : [],
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
    ...(q.fromPrices.length
      ? { starting_price: `The venue lists ${q.fromPrices.join(', ')} as "starting at" this price. Say it's a starting price and the team confirms the final one. Never call it exact.` }
      : {}),
    ...(p.notStated.length
      ? {
          not_included: `The venue doesn't list its ${p.notStated.map((n) => n.replace('_', ' ')).join(', ')}. Say this price is before any of those and the team will confirm them. Never say there are none.`,
        }
      : {}),
  }
}
