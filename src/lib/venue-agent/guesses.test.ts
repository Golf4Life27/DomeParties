import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guessesIn, guessesLine, markGuesses, writesHeadcount, writesLength, writesUnitBasis } from './guesses'
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
  assert.match(String(k.hours), /team will confirm/)
  assert.match(String(k.guests), /team will confirm/)
  // The same details written on the pages are left alone.
  const same = markGuesses(castle(), ['Our 2 hour birthday party is for up to 40 guests.'])
  assert.deepEqual(same.guessed, [])
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
  assert.match(String(q.team_confirms), /estimate/)
  assert.equal(q.estimate_only, true)
  // Venues set up by hand carry no guesses, so their quotes are unchanged.
  const plain = describeQuote(v, quote(v, { packageId: hourly.id, guests: 15, date: null, start: null, hours: 2, foodId: null, foodGuests: null, addOns: [] }))
  assert.equal(plain.team_confirms, undefined)
})
