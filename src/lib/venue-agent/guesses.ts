import type { VenueProfile } from './profile'

// Nov 26: in 4 of 9 self-serve chats, guests were told things the setup reader only
// assumed (2-hour parties, 40 guests, 4 per bay, "$20 per simulator" when the site
// never said per simulator). Prices were already checked against the pages; these
// details weren't. Each one is now looked for on the pages, and any the pages don't
// write is marked as a guess, so the chat says the team will confirm it.

const WORDS: Record<number, string> = {
  1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve',
}
const num = (n: number) => (WORDS[n] ? `(?:${n}|${WORDS[n]})` : `${n}`)
const PEOPLE = '(?:players?|guests?|people|persons?|golfers?|bowlers?|kids|children|participants|jumpers|racers|skaters|attendees)'
const CAP = '(?:up to|max(?:imum)?(?: of)?|holds?|fits?|accommodates?|seats?|capacity(?: of)?|limit(?: of)?|no more than)'

/** True when the pages write n as a headcount ("up to 6 players", "4 guests per bay", "10-30 kids"). */
export function writesHeadcount(text: string, n: number): boolean {
  const k = num(n)
  return (
    new RegExp(`\\b${k}\\s*(?:\\+\\s*)?${PEOPLE}`, 'i').test(text) ||
    new RegExp(`${CAP}\\s*${k}\\b`, 'i').test(text) ||
    new RegExp(`\\b\\d{1,3}\\s*(?:-|–|to)\\s*${k}\\s*${PEOPLE}`, 'i').test(text)
  )
}

/** True when the pages write a length of minutes ("2 hours", "two-hour", "90 minutes", "1.5 hrs", "hour and a half"). */
export function writesLength(text: string, minutes: number): boolean {
  const h = minutes / 60
  const hours: string[] = []
  if (Number.isInteger(h)) hours.push(num(h))
  else hours.push(String(h).replace('.', '\\.'))
  if (h === 1.5) hours.push('(?:one and a half|an hour and a half|1 ½|1½)')
  if (h === 2.5) hours.push('(?:two and a half|2 ½|2½)')
  const hourRe = new RegExp(`\\b(?:${hours.join('|')})\\s*(?:-\\s*)?(?:hours?|hrs?|hr)\\b`, 'i')
  const minRe = new RegExp(`\\b${minutes}\\s*(?:-\\s*)?(?:minutes?|mins?)\\b`, 'i')
  return hourRe.test(text) || minRe.test(text) || (h === 1.5 && /hour and a half/i.test(text)) || (h === 1 && /\b(?:an|one)\s*(?:-\s*)?hour\b/i.test(text))
}

/** True when the pages say an hourly price is per bay, lane or simulator ("$40 per bay per hour", "$30/lane"). */
export function writesUnitBasis(p: VenueProfile, text: string): boolean {
  const units = [p.unit.singular, p.unit.plural, 'bay', 'lane', 'simulator', 'sim', 'stall', 'suite', 'room', 'court', 'box', 'table']
    .map((u) => u.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`(?:per|each|/)\\s*(?:${[...new Set(units)].join('|')})\\b`, 'i').test(text)
}

/** Marks every party length, guest limit, guests-per-bay count and hourly price basis the pages don't write. */
export function markGuesses(p: VenueProfile, pageTexts: string[]): VenueProfile {
  const text = pageTexts.join('\n')
  const guessed = new Set<string>()
  const unitGuests = writesHeadcount(text, p.unit.guestsPerUnit)
  const hourly = p.packages.filter((k) => k.pricing.type === 'per_unit_hour')
  if (hourly.some((k) => k.pricing.type === 'per_unit_hour' && k.pricing.guestsPerUnit == null) && !unitGuests) guessed.add('unit.guests')
  if (hourly.some((k) => k.priceListed) && !writesUnitBasis(p, text)) guessed.add('price.basis')
  for (const k of p.packages) {
    // Hourly rentals are sold by the hour, so their 60 minutes is how they're priced, not a party length.
    if (k.pricing.type !== 'per_unit_hour' && !writesLength(text, k.durationMinutes)) guessed.add(`pkg:${k.id}:length`)
    const own = k.pricing.type === 'per_unit_hour' ? k.pricing.guestsPerUnit : null
    const fromUnits = k.pricing.type === 'per_unit_hour' && own == null && p.unit.count != null && unitGuests && k.maxGuests === p.unit.count * p.unit.guestsPerUnit
    if (!fromUnits && !writesHeadcount(text, k.maxGuests)) guessed.add(`pkg:${k.id}:guests`)
  }
  const list = [...guessed]
  return list.length === p.guessed.length && list.every((g) => p.guessed.includes(g)) ? p : { ...p, guessed: list }
}

/** The owner's line naming what the chat will leave to the team, in plain words. */
export function guessesLine(p: VenueProfile): string | null {
  if (!p.guessed.length) return null
  const parts: string[] = []
  if (p.guessed.includes('unit.guests')) parts.push(`how many guests fit in a ${p.unit.singular}`)
  if (p.guessed.includes('price.basis')) parts.push(`whether the hourly price is per ${p.unit.singular} or per guest`)
  for (const k of p.packages) {
    const l = p.guessed.includes(`pkg:${k.id}:length`)
    const g = p.guessed.includes(`pkg:${k.id}:guests`)
    if (l && g) parts.push(`how long ${k.name} runs and how many guests it takes`)
    else if (l) parts.push(`how long ${k.name} runs`)
    else if (g) parts.push(`how many guests ${k.name} takes`)
  }
  const shown = parts.slice(0, 6).join('; ') + (parts.length > 6 ? `; and ${parts.length - 6} more` : '')
  return `Your website doesn't say ${shown}. The chat tells guests your team will confirm these. Reply with the right details and we'll add them.`
}

/** What a quote for this package rests on that the website never wrote, for the agent. */
export function guessesIn(p: VenueProfile, packageId: string): string[] {
  const k = p.packages.find((x) => x.id === packageId)
  if (!k) return []
  const out: string[] = []
  if (p.guessed.includes(`pkg:${k.id}:length`)) out.push('the party length')
  if (p.guessed.includes(`pkg:${k.id}:guests`)) out.push('the guest limit')
  if (k.pricing.type === 'per_unit_hour') {
    if (k.pricing.guestsPerUnit == null && p.guessed.includes('unit.guests')) out.push(`how many guests fit in a ${p.unit.singular}, so how many ${p.unit.plural} are needed`)
    if (p.guessed.includes('price.basis')) out.push(`whether the hourly price is per ${p.unit.singular} or per guest`)
  }
  return out
}
