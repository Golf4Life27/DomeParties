import { test } from 'node:test'
import assert from 'node:assert/strict'
import { admittedGuesses, guessesIn, guessesLine, markGuesses, writesHeadcount, writesLength, writesUnitBasis, writesUnitHeadcount } from './guesses'
import { describeQuote, quote } from './quote'
import { partyOptionsFor } from './tools'
import { getVenue } from '@/venues'
import type { VenueProfile } from './profile'

test('headcounts and lengths are found only when the pages write them', () => {
  assert.ok(writesHeadcount('Each bay holds up to 6 players', 6))
  assert.ok(writesHeadcount('Parties for 10-30 kids', 30))
  assert.ok(writesHeadcount('Fits four guests per simulator', 4))
  assert.ok(!writesHeadcount('Bay rental $40 per hour', 4))
  assert.ok(!writesHeadcount('Open 4 days a week', 4))
  assert.ok(writesLength('A two-hour party in the bay', 120))
  assert.ok(writesLength('90 minutes of bowling', 90))
  assert.ok(writesLength('1.5 hours of play', 90))
  assert.ok(!writesLength('Birthday party $299', 120))
})

test('an hourly price counts as per bay only when the pages say so', () => {
  const v = getVenue('golf-616')!
  assert.ok(writesUnitBasis(v, '$40 per bay per hour'))
  assert.ok(writesUnitBasis(v, '$30/lane'))
  assert.ok(!writesUnitBasis(v, '$20 per hour. Book a bay today'))
})

const castle = (): VenueProfile => {
  const v = getVenue('golf-616')!
  return {
    ...v,
    guessed: [],
    packages: [{ ...v.packages.find((k) => k.pricing.type !== 'per_unit_hour') ?? v.packages[0], id: 'party', name: 'Birthday Party', durationMinutes: 120, minGuests: 1, maxGuests: 40, priceListed: false }],
  } as VenueProfile
}

test('a party length and guest limit the pages never write are marked, named to the owner, and left to the team (Nov 26, Castle Fun Center)', () => {
  const p = markGuesses(castle(), ['Birthday parties! Call us to book your party.'])
  assert.ok(p.guessed.includes('pkg:party:length'))
  assert.ok(p.guessed.includes('pkg:party:guests'))
  assert.match(guessesLine(p)!, /how long Birthday Party runs and how many guests it takes/)
  assert.doesNotMatch(guessesLine(p)!, /pkg:|guessed|unit\./)
  const opts = partyOptionsFor(p)
  const k = opts.packages.find((x) => x.id === 'party')!
  assert.match(String(k.hours), /team confirms/)
  assert.match(String(k.guests), /team confirms/)
  // The same details written on the pages are left alone.
  const c = castle()
  const same = markGuesses(c, [`Our 2 hour birthday party is for up to 40 guests. Up to ${c.unit.guestsPerUnit} players per ${c.unit.singular}.`])
  assert.deepEqual(same.guessed, [])
  // The reader's own note that it assumed them wins over a page that happens to mention the numbers.
  const admitted = markGuesses(c, ['Our 2 hour birthday party is for up to 40 guests.'], ['2 hours was used as a placeholder for every party; 40 was used as a placeholder.'])
  assert.ok(admitted.guessed.includes('pkg:party:length') && admitted.guessed.includes('pkg:party:guests'))
})

test('a quote resting on a guessed bay size or price basis says so (Nov 26, NextGen Golf)', () => {
  const v = getVenue('golf-616')!
  const hourly = v.packages.find((k) => k.pricing.type === 'per_unit_hour' && k.pricing.guestsPerUnit == null && k.priceListed)
  if (!hourly) return
  const p = markGuesses({ ...v, guessed: [] }, ['Simulators $20 per hour.'])
  assert.ok(p.guessed.includes('unit.guests'))
  assert.ok(p.guessed.includes('price.basis'))
  assert.ok(guessesIn(p, hourly.id).length >= 2)
  const q = describeQuote(p, quote(p, { packageId: hourly.id, guests: 15, date: null, start: null, hours: 2, foodId: null, foodGuests: null, addOns: [] }))
  // No total and no bay count when either rests on a guess: the hourly price as written, then the team.
  assert.match(String(q.team_confirms), /Never give a total/)
  assert.equal((q as { total?: string }).total, undefined)
  assert.match(String((q as { hourly_price?: string }).hourly_price), /per hour$|per hour,/)
  const opts = partyOptionsFor(p)
  assert.doesNotMatch(JSON.stringify(opts), new RegExp(`per ${p.unit.singular} per hour|up to ${p.unit.guestsPerUnit} guests each`))
  // Venues set up by hand carry no guesses, so their quotes are unchanged.
  const plain = describeQuote(v, quote(v, { packageId: hourly.id, guests: 15, date: null, start: null, hours: 2, foodId: null, foodGuests: null, addOns: [] }))
  assert.equal(plain.team_confirms, undefined)
})

test('the reader\'s own notes mark what it assumed (Nov 27 runs)', () => {
  const v = getVenue('golf-616')!
  const a = admittedGuesses(v, [
    'Each lane holds up to 6 guests was assumed, since the site doesn\'t say.',
    'The site doesn\'t say if the $20 per hour is for the whole simulator or for each person.',
    'Hours for Sunday not listed',
  ])
  assert.ok(a.has('unit.guests'))
  assert.ok(a.has('price.basis'))
  assert.ok(![...a].some((k) => k.endsWith(':length')))
  assert.ok(writesUnitHeadcount(v, 'Each bay holds up to 4 players', 4))
  assert.ok(writesUnitHeadcount(v, '6 bowlers per lane', 6))
  assert.ok(!writesUnitHeadcount(v, 'Parties of 4 players or more. Book a bay.', 4))
})
