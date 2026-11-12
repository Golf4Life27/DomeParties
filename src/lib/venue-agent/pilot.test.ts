import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getVenue } from '@/venues'
import type { VenueProfile } from './profile'
import type { Handoff } from './tools'
import { leadEmailText } from './handoff'
import { decide, memoryStore, monthlyStatement, pilotDay, pilotLine, whyNotCounted, type PilotDecision } from './pilot'

// Sample Lanes is in Chicago; its pilot starts Dec 1, 2026 (day 0) and counts through Jan 29, 2027 (day 59).
const base = getVenue('sample-lanes')!
const v: VenueProfile = { ...base, pilot: { startDate: '2026-12-01' } }
const at = (iso: string) => new Date(iso) // UTC; Chicago is 6 hours behind in winter

const party: Handoff = {
  reason: 'ready_to_book',
  topic: 'party_or_event',
  summary: 'Birthday for 12 kids.',
  guest_name: 'Jordan Reyes',
  guest_email: 'Jordan@Example.com',
  guest_phone: null,
  preferred_date: '2026-12-20',
  headcount: 12,
}

async function run(store: ReturnType<typeof memoryStore>, h: Handoff, when: Date): Promise<PilotDecision> {
  const d = await decide(v, h, when, store)
  if (d.count) await store.add(d.request)
  return d
}

test('pilot: counts a party request only with date, headcount, name and a way to reach the guest', () => {
  assert.deepEqual(whyNotCounted(party), [])
  assert.deepEqual(whyNotCounted({ ...party, headcount: null }), ['missing headcount'])
  assert.deepEqual(whyNotCounted({ ...party, preferred_date: null, guest_name: null }), ['missing date, name'])
  assert.deepEqual(whyNotCounted({ ...party, guest_email: null }), ['missing email or phone'])
  assert.deepEqual(whyNotCounted({ ...party, guest_email: null, guest_phone: '(555) 201-3344' }), [])
})

test('pilot: complaints and general questions never count, even with every detail', () => {
  assert.deepEqual(whyNotCounted({ ...party, reason: 'complaint' }), ['a complaint'])
  assert.deepEqual(whyNotCounted({ ...party, reason: 'complaint', topic: 'party_or_event' }), ['a complaint'])
  assert.deepEqual(whyNotCounted({ ...party, reason: 'question', topic: 'other' }), ['not about a party or event'])
  // A question about a party, with every detail, is a party request.
  assert.deepEqual(whyNotCounted({ ...party, reason: 'question' }), [])
})

test('pilot: the same guest and date within 7 days is one request', async () => {
  const s = memoryStore()
  assert.equal((await run(s, party, at('2026-12-02T18:00:00Z'))).count, true)
  // Same email in another case, 2 days later: not counted.
  const again = await run(s, { ...party, guest_email: 'jordan@example.com' }, at('2026-12-04T18:00:00Z'))
  assert.deepEqual(again, { count: false, why: 'same guest and date within 7 days' })
  // Same guest, another date: counted.
  assert.equal((await run(s, { ...party, preferred_date: '2026-12-27' }, at('2026-12-04T19:00:00Z'))).count, true)
  // Same guest and date, 8 days after the first: counted again.
  assert.equal((await run(s, party, at('2026-12-10T18:00:00Z'))).count, true)
  assert.equal(s.all.length, 3)
})

test('pilot: phone numbers match however they are written', async () => {
  const s = memoryStore()
  const byPhone = { ...party, guest_email: null, guest_phone: '555-201-3344' }
  assert.equal((await run(s, byPhone, at('2026-12-02T18:00:00Z'))).count, true)
  assert.equal((await run(s, { ...byPhone, guest_phone: '+1 (555) 201 3344' }, at('2026-12-03T18:00:00Z'))).count, false)
})

test('pilot: stops counting at day 60 and never counts before the start', async () => {
  assert.equal(pilotDay(v, at('2026-12-01T12:00:00Z')), 0)
  assert.equal(pilotDay(v, at('2027-01-29T23:00:00Z')), 59) // 5pm Jan 29 in Chicago
  assert.equal(pilotDay(v, at('2027-01-30T07:00:00Z')), 60) // 1am Jan 30 in Chicago
  const s = memoryStore()
  assert.deepEqual(await decide(v, party, at('2026-11-30T12:00:00Z'), s), { count: false, why: 'no pilot running' })
  assert.equal((await decide(v, party, at('2027-01-29T23:00:00Z'), s)).count, true)
  assert.deepEqual(await decide(v, party, at('2027-01-30T07:00:00Z'), s), { count: false, why: 'pilot ended' })
  assert.deepEqual(await decide(base, party, at('2026-12-05T12:00:00Z'), s), { count: false, why: 'no pilot running' })
})

test('pilot: $20 each, capped at $299 a calendar month, and a new month starts fresh', async () => {
  const s = memoryStore()
  let last: PilotDecision | null = null
  for (let i = 0; i < 16; i++) {
    last = await run(s, { ...party, guest_email: `guest${i}@example.com` }, at(`2026-12-${String(i + 2).padStart(2, '0')}T18:00:00Z`))
  }
  assert.ok(last?.count)
  if (!last?.count) return
  assert.equal(last.numberThisMonth, 16)
  assert.equal(last.chargeThisMonthCents, 29900) // 16 x $20 = $320, capped
  assert.match(pilotLine(last), /request 16 this month, so \$299 so far, which is the \$299 monthly cap/)
  // Dec 31 at 11pm in Chicago is still December; 1am Jan 1 is January.
  const dec31 = await run(s, { ...party, guest_email: 'late@example.com' }, at('2027-01-01T05:00:00Z'))
  const jan1 = await run(s, { ...party, guest_email: 'early@example.com' }, at('2027-01-01T07:00:00Z'))
  assert.ok(dec31.count && jan1.count)
  if (dec31.count && jan1.count) {
    assert.equal(dec31.numberThisMonth, 17)
    assert.equal(jan1.numberThisMonth, 1)
    assert.match(pilotLine(jan1), /request 1 this month, so \$20 so far \(\$20 each/)
  }
})

test('pilot: the monthly list shows every counted request so the venue can check it', async () => {
  const s = memoryStore()
  await run(s, party, at('2026-12-02T03:30:00Z')) // Dec 1, 9:30pm in Chicago
  await run(s, { ...party, guest_email: null, guest_phone: '555-201-3344', guest_name: 'Pat Kim', headcount: 30, preferred_date: '2027-01-09' }, at('2026-12-15T20:00:00Z'))
  await run(s, { ...party, reason: 'complaint' }, at('2026-12-16T20:00:00Z')) // never counted
  const dec = monthlyStatement(v, '2026-12', s.all)
  assert.equal(dec.count, 2)
  assert.equal(dec.chargeCents, 4000)
  assert.match(dec.subject, /Sample Lanes: 2 party requests in December 2026/)
  assert.match(dec.text, /1\. Dec 1, 9:30 PM: Jordan Reyes, 12 guests on Sunday, December 20, 2026, Jordan@Example.com/)
  assert.match(dec.text, /2\. Dec 15, 2:00 PM: Pat Kim, 30 guests on Saturday, January 9, 2027, 555-201-3344/)
  assert.match(dec.text, /Total for December 2026: \$40\./)
  assert.match(dec.text, /runs through Friday, January 29, 2027/)
  const none = monthlyStatement(v, '2027-02', s.all)
  assert.equal(none.count, 0)
  assert.match(none.text, /No party requests were counted/)
})

test('pilot: the lead email carries the running count only when one is given', () => {
  assert.doesNotMatch(leadEmailText(v, party).text, /PartyDesk pilot/)
  assert.match(leadEmailText(v, party, 'PartyDesk pilot: this is party request 2 this month, so $40 so far').text, /request 2 this month/)
})
