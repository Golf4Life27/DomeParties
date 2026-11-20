import type { VenueProfile } from './profile'

// Checks that every price a setup quotes is written on the venue's own pages.
// The setup is drafted by a model from those pages, and a demo that quotes an
// owner a price they never set loses that owner, so each number is looked for
// word for word in the text that was read. Nov 19: 2 of 10 fresh setups held
// prices no page read showed.

export type PriceLine = { where: string; amount: number; kind: 'money' | 'percent' }
export type PriceFinding = PriceLine & { found: 'priced' | 'bare' | 'missing' }

/** Every price and rate a setup would quote to a guest. Zero and "not listed online" are not prices. */
export function pricesIn(p: VenueProfile): PriceLine[] {
  const out: PriceLine[] = []
  const money = (where: string, amount: number | null | undefined) => {
    if (amount && amount > 0) out.push({ where, amount, kind: 'money' })
  }
  for (const k of p.packages) {
    if (!k.priceListed) continue
    money(k.name, k.pricing.amount)
    money(`${k.name} (peak)`, k.pricing.peakAmount)
    if (k.pricing.type === 'per_person') for (const t of k.pricing.tiers) money(`${k.name} (${t.minGuests}+ guests)`, t.amount)
  }
  for (const f of p.food) {
    money(f.name, f.amount)
    money(`${f.name} (top of range)`, f.amountTo)
  }
  for (const a of p.addOns) {
    money(a.name, a.amount)
    money(`${a.name} (top of range)`, a.amountTo)
  }
  money('Deposit', p.deposit.flat)
  const pct = (where: string, n: number | null | undefined) => {
    if (n && n > 0) out.push({ where, amount: n, kind: 'percent' })
  }
  pct('Deposit', p.deposit.percent)
  pct('Tax', p.taxPercent)
  pct('Service charge', p.serviceCharge.percent)
  return out
}

/** The ways a page can write a number: 1500, 1,500, 1500.00, 12.5, 12.50. */
function spellings(n: number): string[] {
  const s = new Set<string>()
  const whole = Number.isInteger(n)
  const fixed = n.toFixed(2)
  if (whole) {
    s.add(String(n))
    s.add(n.toLocaleString('en-US'))
    s.add(n.toLocaleString('de-DE')) // 1.500 in much of Europe
  } else {
    s.add(fixed)
    s.add(String(n))
  }
  s.add(fixed)
  s.add(fixed.replace('.', ',')) // 12,50
  return [...s]
}

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const CURRENCY = '(?:[$£€¥]|A\\$|AU\\$|US\\$|NZ\\$|C\\$|CA\\$|USD|GBP|EUR|AUD)'

/** priced: the number is written as a price (a currency sign, or "per", "each", "/hr" after it).
 *  bare: the number is on the pages but not written as a price. missing: not on the pages at all. */
export function findPrice(line: PriceLine, text: string): PriceFinding['found'] {
  const t = text.replace(/ /g, ' ')
  const alts = spellings(line.amount).map(esc).join('|')
  const num = `(?<![\\d.,])(?:${alts})(?![\\d]|[.,]\\d)`
  if (line.kind === 'percent') {
    if (new RegExp(`${num}\\s?(?:%|percent)`, 'i').test(t)) return 'priced'
    return new RegExp(num).test(t) ? 'bare' : 'missing'
  }
  const priced = new RegExp(
    `${CURRENCY}\\s?${num}|${num}\\s?(?:${CURRENCY}|dollars|pounds|euros|/\\s?(?:hr|hour|person|guest|lane|bay|child|kid|pp)|\\s?(?:per|each|pp|p\\.p\\.|a head|an hour|/))`,
    'i',
  )
  if (priced.test(t)) return 'priced'
  // A menu often lists "Pizza ...... 17.99" with no sign: a number with cents is a price.
  const fixed = line.amount.toFixed(2)
  if (new RegExp(`(?<![\\d.,])(?:${esc(fixed)}|${esc(fixed.replace('.', ','))})(?![\\d])`).test(t)) return 'priced'
  return new RegExp(num).test(t) ? 'bare' : 'missing'
}

export function checkPrices(p: VenueProfile, pageTexts: string[]): PriceFinding[] {
  const text = pageTexts.join('\n')
  return pricesIn(p).map((l) => ({ ...l, found: findPrice(l, text) }))
}

/** A plain line for the owner's checklist, one per price the pages don't show as a price. */
export function unconfirmedLine(f: PriceFinding): string {
  const shown = f.kind === 'percent' ? `${f.amount}%` : String(f.amount)
  return `${f.where}: ${shown} isn't written as a price on the pages read. Check it before guests see it.`
}
