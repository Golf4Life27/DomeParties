import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keepConfirmedPrices, pricesIn, type PriceLine } from './price-check'
import { getVenue } from '@/venues'
import type { VenueProfile } from './profile'

const write = (l: PriceLine) => (l.kind === 'percent' ? `${l.amount}%` : `$${l.amount.toFixed(2)} each`)

test('a website setup keeps only prices the pages write as prices (Nov 26, Triad Lanes)', () => {
  const v = getVenue('golf-616')!
  const all = pricesIn(v)
  const first = v.packages.find((k) => k.priceListed && k.pricing.amount > 0)!
  // Pages that write every price but the first package's base price.
  const r = keepConfirmedPrices(v, [all.filter((l) => l.where !== first.name).map(write).join('\n')])
  const kept = r.profile.packages.find((k) => k.id === first.id)!
  assert.equal(kept.priceListed, false)
  assert.equal(kept.pricing.amount, 0)
  assert.ok(r.dropped.some((d) => d.where === first.name))
  assert.ok(!pricesIn(r.profile).some((l) => l.where.startsWith(first.name)))
  // Everything the pages write is left alone.
  const same = keepConfirmedPrices(v, [all.map(write).join('\n')])
  assert.equal(same.dropped.length, 0)
  assert.equal(same.profile, v)
})

test('an unwritten deposit or tax becomes "not stated" instead of a number', () => {
  const v = { ...getVenue('golf-616')!, packages: [], food: [], addOns: [], deposit: { percent: 10, flat: null }, taxPercent: 8, notStated: [] } as unknown as VenueProfile
  const r = keepConfirmedPrices(v, ['Nothing about money here'])
  assert.equal(r.profile.deposit.percent, null)
  assert.equal(r.profile.taxPercent, 0)
  assert.deepEqual([...r.profile.notStated].sort(), ['deposit', 'tax'])
})
