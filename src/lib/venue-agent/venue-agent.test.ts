// Run with: pnpm test:venue-agent
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getVenue, listVenues } from '@/venues'
import { parseProfile, type VenueProfile } from './profile'
import { quote, QuoteError } from './quote'
import { addDays, fitsHours, hoursOn, isPeak, todayIn, weekdayOf } from './clock'
import { formatMoney } from './money'
import { runVenueTool } from './tools'
import { venueSystemPrompt } from './prompt'
import { leadEmailText } from './handoff'

const venue = (slug: string): VenueProfile => {
  const v = getVenue(slug)
  assert.ok(v, `missing sample venue ${slug}`)
  return v
}
const lanes = venue('sample-lanes')
const london = venue('sample-swing-social')
const tokyo = venue('sample-tokyo-range')
const base = { start: null, foodId: null, foodGuests: null, addOns: [] }

test('every venue setup is valid and they cover several venue types, currencies and languages', () => {
  const all = listVenues()
  assert.ok(all.length >= 3)
  assert.deepEqual(new Set(all.map((v) => v.currency)), new Set(['USD', 'GBP', 'JPY']))
  assert.ok(new Set(all.map((v) => v.kind)).size >= 3)
})

test('a bad setup is refused before any guest sees it', () => {
  assert.throws(() => parseProfile({ ...lanes, timeZone: 'Mars/Olympus' }), /time zone/)
  assert.throws(() => parseProfile({ ...lanes, currency: 'usd' }))
  assert.throws(() => parseProfile({ ...lanes, packages: [lanes.packages[0], lanes.packages[0]] }), /Duplicate id/)
  assert.throws(() => parseProfile({ ...lanes, packages: [] }))
})

test('calendar dates: weekdays, month ends and the venue clock', () => {
  assert.equal(weekdayOf('2027-01-10'), 'sun')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  // 3am UTC on Nov 1 is still Oct 31 in Illinois but Nov 1 in Tokyo.
  const now = new Date('2026-11-01T03:00:00Z')
  assert.equal(todayIn(lanes.timeZone, now), '2026-10-31')
  assert.equal(todayIn(tokyo.timeZone, now), '2026-11-01')
})

test('hours: closures, and parties that run past midnight', () => {
  assert.equal(hoursOn(lanes, '2026-11-26').closed, true)
  assert.equal(hoursOn(lanes, '2026-11-26').note, 'Thanksgiving')
  // Friday opens 12:00 to 01:00.
  assert.equal(fitsHours(lanes, '2026-11-06', '23:00', 120), true)
  assert.equal(fitsHours(lanes, '2026-11-06', '23:30', 120), false)
  assert.equal(fitsHours(lanes, '2026-11-06', '11:00', 120), false)
})

test('bowling: kids birthday, no food, so no service charge', () => {
  const q = quote(lanes, { ...base, packageId: 'kids-birthday', guests: 12, date: '2026-11-07', start: '14:00' })
  assert.equal(q.peak, false)
  assert.equal(q.subtotal, 26388) // 12 x $21.99
  assert.equal(q.serviceCharge, 0)
  assert.equal(q.tax, 2177) // 8.25%
  assert.equal(q.total, 28565)
  assert.equal(q.deposit, 5000) // flat $50
  assert.equal(q.balance, 23565)
})

test('bowling: the service charge comes on once food is added', () => {
  const q = quote(lanes, { ...base, packageId: 'kids-birthday', guests: 12, date: '2026-11-07', start: '14:00', foodId: 'pizza-pop' })
  assert.equal(q.subtotal, 26388 + 10800)
  assert.equal(q.serviceCharge, 6694) // 18% of $371.88
  assert.equal(q.tax, 3068) // tax on the subtotal, not the service charge
  assert.equal(q.total, 37188 + 6694 + 3068)
})

test('bowling: lanes by the hour, sized to the group, at peak price', () => {
  const q = quote(lanes, { ...base, packageId: 'lane-party', guests: 20, date: '2026-11-07', start: '19:00' })
  assert.equal(q.peak, true)
  assert.equal(q.units, 4) // 20 guests, 6 a lane
  assert.equal(q.subtotal, 44000) // 4 lanes x 2 h x $55
})

test('bowling: refuses what the venue does not sell', () => {
  const tryQuote = (r: Partial<Parameters<typeof quote>[1]>) => () =>
    quote(lanes, { ...base, packageId: 'kids-birthday', guests: 12, date: null, ...r })
  assert.throws(tryQuote({ date: '2026-11-09' }), QuoteError) // Monday: not offered
  assert.throws(tryQuote({ date: '2026-11-26' }), /Closed/)
  assert.throws(tryQuote({ guests: 40 }), /8 to 30/)
  assert.throws(tryQuote({ packageId: 'nope' }), /Unknown package/)
  assert.throws(() => quote(lanes, { ...base, packageId: 'lane-party', guests: 72, date: null, addOns: [], foodId: 'nope' }), /Unknown food/)
})

test('London: pounds, VAT-inclusive prices and a percent deposit', () => {
  const q = quote(london, { ...base, packageId: 'christmas-party', guests: 20, date: '2026-12-11', start: '19:00' })
  assert.equal(q.peak, true)
  assert.equal(q.total, 138000)
  assert.equal(q.deposit, 34500)
  assert.equal(formatMoney(q.total, london.currency, london.locale), '£1,380.00')
})

test('Tokyo: yen have no decimals and tax is added on top', () => {
  const q = quote(tokyo, { ...base, packageId: 'company-event', guests: 10, date: '2026-11-07', start: null })
  assert.equal(q.subtotal, 55000) // weekend price all day
  assert.equal(q.tax, 5500)
  assert.equal(q.total, 60500)
  assert.equal(q.deposit, null)
  assert.match(formatMoney(q.total, tokyo.currency, tokyo.locale), /60,500/)
})

test('tools: answers come back as JSON the agent can act on', async () => {
  const today = '2026-11-01'
  const opts = JSON.parse(await runVenueTool(lanes, 'party_options', {}, 'dry', today))
  assert.equal(opts.packages.length, 3)
  assert.match(opts.packages[0].price, /\$21\.99 per guest/)

  const price = JSON.parse(
    await runVenueTool(lanes, 'price_party', { package_id: 'kids-birthday', guests: 12, date: '2026-11-07', start_time: '14:00', food_id: null, food_guests: null, add_ons: [] }, 'dry', today),
  )
  assert.equal(price.total, '$285.65')
  assert.equal(price.deposit, '$50.00')

  const tooSoon = JSON.parse(
    await runVenueTool(lanes, 'price_party', { package_id: 'kids-birthday', guests: 12, date: '2026-11-02', start_time: null, food_id: null, food_guests: null, add_ons: [] }, 'dry', today),
  )
  assert.match(tooSoon.error, /2 days ahead/)

  const hours = JSON.parse(await runVenueTool(tokyo, 'venue_hours', { start_date: '2027-01-01', days: 2 }, 'dry', today))
  assert.match(hours.days[0].open, /closed/)

  const link = JSON.parse(await runVenueTool(lanes, 'booking_link', {}, 'dry', today))
  assert.equal(link.link, lanes.booking.partyUrl)

  const bad = JSON.parse(await runVenueTool(lanes, 'price_party', { package_id: 'x' }, 'dry', today))
  assert.ok(bad.error)
})

test('hand-off: never sent without a way to reach the guest, never sent in a demo', async () => {
  const h = { reason: 'question', summary: 'Asks about leagues.', guest_name: 'Sam', guest_email: null, guest_phone: null, preferred_date: null, headcount: null }
  assert.match(JSON.parse(await runVenueTool(lanes, 'hand_to_team', h, 'dry')).error, /no way to reach/)
  const ok = JSON.parse(await runVenueTool(lanes, 'hand_to_team', { ...h, guest_email: 'sam@example.com' }, 'dry'))
  assert.equal(ok.passed_to_team, true)
  const mail = leadEmailText(lanes, { ...h, reason: 'question', guest_email: 'sam@example.com', headcount: 14 })
  assert.match(mail.subject, /Sam, 14 guests/)
})

test('instructions follow the venue: its name, language, answers and sample notice', () => {
  const ja = venueSystemPrompt(tokyo)
  assert.match(ja, /Write in Japanese/)
  assert.match(ja, /クラブのレンタル/)
  assert.match(ja, /sample venue/)
  const en = venueSystemPrompt(lanes)
  assert.match(en, /Sample Lanes, a bowling center/)
  assert.doesNotMatch(en, /Whitetail/)
})

test('a prospect preview says what it is and stays off the public sample list', () => {
  const p = parseProfile({ ...lanes, slug: 'real-lanes', sample: false, prospect: true })
  assert.match(venueSystemPrompt(p), /preview set up from .*public website/)
  assert.doesNotMatch(venueSystemPrompt(p), /made up to show/)
  assert.ok(listVenues().every((v) => v.sample))
})

test('peak can be weekday evenings plus whole weekends', () => {
  const p = parseProfile({ ...lanes, peak: { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '16:00', allDay: ['sat', 'sun'] } })
  // 2026-11-14 is a Saturday, 2026-11-11 a Wednesday.
  assert.equal(isPeak(p, '2026-11-14', '10:00'), true)
  assert.equal(isPeak(p, '2026-11-11', '10:00'), false)
  assert.equal(isPeak(p, '2026-11-11', '17:00'), true)
})
