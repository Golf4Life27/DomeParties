import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasFieldName, plainLine } from './plain-words'

test('field names in the owner list become plain words', () => {
  assert.equal(plainLine('Gift card link saved under otherLinks, not a party page'), 'Gift card link saved under other booking links, not a party page')
  assert.equal(plainLine('unit.count not listed'), 'Number of bays or lanes not listed')
  assert.equal(plainLine('No `booking.partyUrl` on the site'), 'No party booking page on the site')
  assert.equal(plainLine('Tax rate is notStated'), 'Tax rate is not stated')
  assert.equal(plainLine('Priced per_unit_hour'), 'Priced hourly')
  assert.equal(plainLine('unit.guestsPerUnit set to 4'), 'Guests per bay or lane set to 4')
})

test('ordinary words, prices and web addresses are left alone', () => {
  for (const s of ['No party prices on the website', 'Hours for Sunday not listed', 'Deposit of $12.50 per person', 'See https://www.example.com/partyPackages for more', 'Prices load inside bookingsite.com']) {
    assert.equal(plainLine(s), s)
    assert.equal(hasFieldName(s), false, s)
  }
})

test('the checker spots a field name and passes the cleaned line', () => {
  assert.equal(hasFieldName('saved under otherLinks'), true)
  assert.equal(hasFieldName(plainLine('saved under otherLinks')), false)
})

test('jargon words become plain words', () => {
  assert.equal(plainLine('Using the signup email for handoff'), 'Using the signup email for guest requests')
  assert.equal(hasFieldName('Using the signup email for handoff'), true)
})

test('a reply with a stand-in for a number is caught', async () => {
  const { hasStandIn } = await import('./run')
  assert.equal(hasStandIn('each package includes 8 guests plus $X for each extra guest'), true)
  assert.equal(hasStandIn('Total [price] before tax'), true)
  for (const ok of ['Basic: $155.00 + 7 extra guests at $119.00 = $274.00', 'A$449 a month', '£229 or €269', 'Starts at $25/hr']) assert.equal(hasStandIn(ok), false, ok)
})
