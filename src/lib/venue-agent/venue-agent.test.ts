// Run with: pnpm test:venue-agent
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getVenue, listVenues } from '@/venues'
import { parseProfile, type VenueProfile } from './profile'
import { describeQuote, quote, QuoteError } from './quote'
import { addDays, fitsHours, hoursOn, isPeak, todayIn, weekdayOf } from './clock'
import { formatMoney } from './money'
import { runVenueTool } from './tools'
import { venueSystemPrompt } from './prompt'
import { leadEmailText } from './handoff'
import { draftFromPasted, flagUnclearDays, flagUnpricedCharges, hasAnyPrice, keepPriceRanges, MAX_PASTED_CHARS, PastedError } from './draft'
import { sameSite } from './read-site'

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
  const noLinkVenue = { ...lanes, booking: { ...lanes.booking, partyUrl: null, howItWorks: 'Book online 7 days ahead or call.' } }
  const noLink = JSON.parse(await runVenueTool(noLinkVenue, 'booking_link', {}, 'dry', today))
  assert.equal(noLink.link, null)
  assert.equal(noLink.how_it_works, 'Book online 7 days ahead or call.')
  assert.match(noLink.note, /never offer or promise/)

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

test('charges the venue never mentions are flagged, not quoted as zero', () => {
  const p = parseProfile({ ...lanes, taxPercent: 0, notStated: ['tax', 'deposit'] })
  const q = describeQuote(p, quote(p, { packageId: p.packages[0].id, guests: p.packages[0].minGuests, date: null, start: null, foodId: null, foodGuests: null, addOns: [] }))
  assert.match(String(q.not_included), /doesn't list its tax, deposit/)
  assert.equal(describeQuote(lanes, quote(lanes, { packageId: lanes.packages[0].id, guests: lanes.packages[0].minGuests, date: null, start: null, foodId: null, foodGuests: null, addOns: [] })).not_included, undefined)
})

test('a package with no price online is never quoted at zero', async () => {
  const pkgs = lanes.packages.map((x, i) => (i === 0 ? { ...x, priceListed: false, pricing: { ...x.pricing, amount: 0 } } : x))
  const p = parseProfile({ ...lanes, packages: pkgs })
  assert.throws(() => quote(p, { ...base, packageId: pkgs[0].id, guests: pkgs[0].minGuests, date: null }), (e: unknown) => e instanceof QuoteError && /doesn't list a price/.test(e.message))
  const opts = JSON.parse(await runVenueTool(p, 'party_options', {}, 'dry', '2026-11-04')) as { packages: { price: string }[] }
  assert.match(opts.packages[0].price, /not listed online/)
})

test('an unknown bay or lane count skips the capacity check instead of assuming one', async () => {
  const p = parseProfile({ ...lanes, unit: { ...lanes.unit, count: null } })
  const pkg = p.packages.find((x) => x.pricing.type === 'per_unit_hour') ?? p.packages[0]
  assert.doesNotThrow(() => quote(p, { ...base, packageId: pkg.id, guests: pkg.maxGuests, date: null }))
  assert.match(JSON.parse(await runVenueTool(p, 'party_options', {}, 'dry', '2026-11-04')).booked_unit, /number not listed/)
})

test('a site with no hours listed is never called closed', async () => {
  const p = parseProfile({ ...lanes, hours: { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] }, hoursListed: false })
  const d = hoursOn(p, '2026-11-14')
  assert.equal(d.closed, false)
  assert.equal(fitsHours(p, '2026-11-14', '19:00', 120), true)
  const out = JSON.parse(await runVenueTool(p, 'venue_hours', { start_date: '2026-11-14', days: 1 }, 'dry', '2026-11-04')) as { days: { open: string }[] }
  assert.match(out.days[0].open, /not listed online/)
})

test('party options never call an unlisted tax, deposit or service charge none', async () => {
  const p = parseProfile({ ...lanes, taxPercent: 0, deposit: { percent: null, flat: null }, serviceCharge: { percent: 0 }, notStated: ['tax', 'deposit', 'service_charge'] })
  const o = JSON.parse(await runVenueTool(p, 'party_options', {}, 'dry', '2026-11-04'))
  for (const k of ['deposit', 'service_charge', 'tax_percent']) assert.match(String(o[k]), /not listed online/)
})

test('hourly packages price the hours asked for, and a private room counts as one booking', () => {
  const room = { id: 'vip', name: 'VIP Room', durationMinutes: 60, minGuests: 1, maxGuests: 6, pricing: { type: 'per_unit_hour', amount: 80, guestsPerUnit: 6 } }
  const hourly = { id: 'bay', name: 'Bay', durationMinutes: 60, minGuests: 1, maxGuests: 40, pricing: { type: 'per_unit_hour', amount: 40 } }
  const p = parseProfile({ ...lanes, unit: { ...lanes.unit, guestsPerUnit: 4 }, packages: [room, hourly], taxPercent: 0, serviceCharge: { percent: 0 }, deposit: { percent: null, flat: null } })
  assert.equal(quote(p, { ...base, packageId: 'vip', guests: 6, date: null, hours: 2 }).total, 16000)
  assert.equal(quote(p, { ...base, packageId: 'bay', guests: 8, date: null, hours: 3 }).total, 24000)
  assert.equal(quote(p, { ...base, packageId: 'bay', guests: 8, date: null }).total, 8000)
  const flat = lanes.packages.find((x) => x.pricing.type !== 'per_unit_hour')!
  assert.throws(() => quote(lanes, { ...base, packageId: flat.id, guests: flat.minGuests, date: null, hours: flat.durationMinutes / 60 + 1 }), /set/)
})

test('a "starting at" price is never quoted as exact', () => {
  const pkgs = lanes.packages.map((x, i) => (i === 0 ? { ...x, priceFrom: true } : x))
  const p = parseProfile({ ...lanes, packages: pkgs })
  const q = describeQuote(p, quote(p, { ...base, packageId: pkgs[0].id, guests: pkgs[0].minGuests, date: null }))
  assert.match(String(q.starting_price), /starting at/)
})

test('a tax or service charge mentioned with no rate is never quoted as zero', () => {
  const base = { ...lanes, taxPercent: 0, serviceCharge: { ...lanes.serviceCharge, percent: 0 }, notStated: [] } as VenueProfile
  const flagged = flagUnpricedCharges(base, [
    "Tax is mentioned ('plus tax') but the rate isn't given",
    'The escape party page mentions a service charge but gives no rate.',
  ])
  assert.deepEqual([...flagged.notStated].sort(), ['service_charge', 'tax'])
  // A site that states its tax keeps it, and unrelated notes change nothing.
  assert.equal(flagUnpricedCharges({ ...base, taxPercent: 7 }, ['The site mentions tax but gives no tax rate.']).notStated.length, 0)
  assert.equal(flagUnpricedCharges(base, ['Number of lanes not listed']), base)
})

test('setup from pasted text turns away empty or oversized input before any model call', async () => {
  await assert.rejects(draftFromPasted({ text: '   ' }, null), PastedError)
  await assert.rejects(draftFromPasted({ text: 'x'.repeat(MAX_PASTED_CHARS + 1) }, null), PastedError)
  await assert.rejects(draftFromPasted({ pdfBase64: Buffer.alloc(3 * 1024 * 1024 + 10).toString('base64') }, null), PastedError)
})

test('the setup reader treats www and subdomains as the same site, and a different domain as a move', () => {
  assert.equal(sameSite('www.thecastlefuncenter.com', 'thecastlefuncenter.com'), true)
  assert.equal(sameSite('book.venue.com', 'venue.com'), true)
  assert.equal(sameSite('www.partycentralinfo.com', 'shreveportssecrets.com'), false)
  assert.equal(sameSite('thehatchetbury.com', 'expireddomains.com'), false)
})

test('a draft with long or too many unsure notes, or a setup sent as text, is kept and tidied', async () => {
  const { draftWrapper } = await import('./draft')
  const long = 'x'.repeat(260)
  const out = draftWrapper.parse({ setup: '{"name":"A"}', unsure: [long, ...Array(40).fill('note')] })
  assert.deepEqual(out.setup, { name: 'A' })
  assert.equal(out.unsure.length, 30)
  assert.equal(out.unsure[0].length, 200)
  assert.equal(draftWrapper.safeParse({ setup: 'not json', unsure: [] }).success, false)
})

test('group prices, per-guest extras by age, and a day whose hours could not be read (new venue types, Nov 5)', async () => {
  const p = parseProfile({
    ...lanes,
    hoursUnclear: ['fri'],
    hours: { ...lanes.hours, fri: [] },
    packages: [
      { id: 'axe-hour', name: '1-hour axe throwing', durationMinutes: 60, maxGuests: 48, pricing: { type: 'per_person', amount: 23, tiers: [{ minGuests: 3, amount: 21 }] } },
      { id: 'jump-party', name: 'Create Your Own Party', durationMinutes: 120, maxGuests: 40, pricing: { type: 'flat', amount: 120 } },
    ],
    addOns: [
      { id: 'jumper-6-plus', name: 'Jumper 6+', unit: 'per_person', amount: 16 },
      { id: 'jumper-5-under', name: 'Jumper 5 and under', unit: 'per_person', amount: 12 },
    ],
    food: [],
    taxPercent: 0,
    serviceCharge: { percent: 0 },
  })
  const fri = '2026-11-20'
  assert.equal(weekdayOf(fri), 'fri')
  // 4 throwers pay the 3-or-more price: $84, not $92.
  assert.equal(quote(p, { ...base, packageId: 'axe-hour', guests: 4, date: null }).subtotal, 8400)
  assert.equal(quote(p, { ...base, packageId: 'axe-hour', guests: 2, date: null }).subtotal, 4600)
  // 12 kids 6+ and 3 under-5s: $120 + 12 x $16 + 3 x $12 = $348, never every price for every guest.
  const party = quote(p, { ...base, packageId: 'jump-party', guests: 15, date: null, addOns: [{ id: 'jumper-6-plus', quantity: 12 }, { id: 'jumper-5-under', quantity: 3 }] })
  assert.equal(party.subtotal, 34800)
  assert.throws(() => quote(p, { ...base, packageId: 'jump-party', guests: 15, date: null, addOns: [{ id: 'jumper-6-plus', quantity: 16 }] }), /how many of the 15 guests/)
  // An unreadable Friday is not closed: quotes go through and the hours tool says the team confirms.
  assert.equal(hoursOn(p, fri).closed, false)
  assert.ok(fitsHours(p, fri, '16:00', 60))
  assert.equal(quote(p, { ...base, packageId: 'jump-party', guests: 10, date: fri, start: '16:00' }).subtotal, 12000)
  const hrs = JSON.parse(await runVenueTool(p, 'venue_hours', { start_date: fri, days: 1 }, 'dry', '2026-11-05')) as { days: { open: string }[] }
  assert.match(hrs.days[0].open, /team will confirm/)
  // Backstop: the reader's own note about a garbled Friday marks it unclear; a plain closed day stays closed.
  const plain = parseProfile({ ...lanes, hours: { ...lanes.hours, fri: [], mon: [] } })
  assert.deepEqual(flagUnclearDays(plain, ['Friday opening time is garbled on the site ("102:00pm-9:00pm"), so Friday hours were left empty.']).hoursUnclear, ['fri'])
  assert.equal(flagUnclearDays(plain, ['Closed Mondays']), plain)
})

test('an extra listed as a price range is quoted as a range, never one exact total (Nov 6)', async () => {
  const p = parseProfile({
    ...lanes,
    packages: [{ id: 'bones-bash', name: 'Bones Bash', durationMinutes: 90, maxGuests: 12, pricing: { type: 'flat', amount: 325 } }],
    addOns: [{ id: 'extra-guest', name: 'Additional guest', unit: 'per_person', amount: 15, amountTo: 18 }],
    food: [],
    taxPercent: 0,
    serviceCharge: { percent: 0 },
  })
  // 14 kids on a 12-guest package: $325 + 2 extra guests at $15 to $18 = $355 to $361.
  const q = quote(p, { ...base, packageId: 'bones-bash', guests: 12, date: null, addOns: [{ id: 'extra-guest', quantity: 2 }] })
  assert.equal(q.total, 35500)
  assert.equal(q.totalHigh, 36100)
  assert.match(String(describeQuote(p, q).price_range), /\$355\.00 to \$361\.00/)
  // No range, no range note.
  const flat = quote(p, { ...base, packageId: 'bones-bash', guests: 12, date: null })
  assert.equal(flat.totalHigh, null)
  assert.equal(describeQuote(p, flat).price_range, undefined)
  // Backstop: a range left only in the description is put back.
  const saved = parseProfile({ ...p, addOns: [{ id: 'extra-guest', name: 'Additional guest', description: 'Listed as $15 – $18 per guest', unit: 'per_person', amount: 15 }] })
  assert.equal(keepPriceRanges(saved).addOns[0].amountTo, 18)
  const opts = JSON.parse(await runVenueTool(keepPriceRanges(saved), 'party_options', {}, 'dry', '2026-11-06')) as { add_ons: { price: string }[] }
  assert.match(opts.add_ons[0].price, /\$15\.00 to \$18\.00 per guest/)
})

test('a setup with no price anywhere is caught, so the owner is asked for their own location page', () => {
  assert.equal(hasAnyPrice(lanes), true)
  const noPrices = parseProfile({
    ...lanes,
    packages: lanes.packages.map((k) => ({ ...k, priceListed: false })),
    food: [],
    addOns: [],
  })
  assert.equal(hasAnyPrice(noPrices), false)
  const oneAddOn = parseProfile({ ...noPrices, addOns: [{ id: 'socks', name: 'Grip socks', unit: 'each', amount: 3 }] })
  assert.equal(hasAnyPrice(oneAddOn), true)
})
