import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findPrice, checkPrices } from './price-check'
import { getVenue } from '@/venues'

const m = (amount: number) => ({ where: 'x', amount, kind: 'money' as const })
const pc = (amount: number) => ({ where: 'x', amount, kind: 'percent' as const })

test('a price counts only when the page writes it as a price', () => {
  assert.equal(findPrice(m(150), 'Kids package $150 per party'), 'priced')
  assert.equal(findPrice(m(150), 'Kids package 150 per party'), 'priced')
  assert.equal(findPrice(m(12.5), 'Large pizza $12.50'), 'priced')
  assert.equal(findPrice(m(1500), 'Full buyout $1,500'), 'priced')
  assert.equal(findPrice(m(229), 'Starter £229 a month'), 'priced')
  assert.equal(findPrice(m(25), '$25/hr per lane'), 'priced')
  assert.equal(findPrice(m(100), 'Room holds 100 guests'), 'bare')
  assert.equal(findPrice(m(100), 'Packages from $150 and $200'), 'missing')
  // 1500 inside 15000 or 150 inside 1500 is not a match
  assert.equal(findPrice(m(150), 'Buyout $1500'), 'missing')
  assert.equal(findPrice(m(15), 'Party $15.50 each'), 'missing')
  assert.equal(findPrice(m(17.99), '16" Large Pizza 17.99'), 'priced')
  assert.equal(findPrice(pc(20), 'A 20% gratuity on groups of 10'), 'priced')
  assert.equal(findPrice(pc(6), 'Lane 6 is open'), 'bare')
})

test('a built demo checks clean against its own price text', () => {
  const v = getVenue('golf-616')!
  const text = 'Weekdays $40/hr. Weekends $60/hr. 3 HOUR WEEKEND SPECIAL $150 ($30 SAVINGS). VIP Room $80/hr'
  const f = checkPrices(v, [text])
  assert.ok(f.length >= 3)
  assert.deepEqual(f.filter((x) => x.found !== 'priced'), [])
})
