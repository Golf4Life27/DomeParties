import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseProfile } from './profile'
import { readTrialToken, trialToken } from './trial-link'

process.env.VENUE_LINK_SECRET = 'test-only-secret'
const sample = parseProfile(JSON.parse(readFileSync(`${__dirname}/../../venues/sample-lanes.json`, 'utf8')))

test('an owner demo link carries the whole setup and reads back the same', () => {
  const t = trialToken(sample)
  assert.ok(t.length < 8000, `link too long: ${t.length}`)
  assert.deepEqual(readTrialToken(t), sample)
})

test('a changed or cut link opens nothing', () => {
  const t = trialToken(sample)
  const [body, mac] = t.split('.')
  const flipped = body.slice(0, -2) + (body.at(-2) === 'A' ? 'B' : 'A') + body.at(-1)
  assert.equal(readTrialToken(`${flipped}.${mac}`), null)
  assert.equal(readTrialToken(t.slice(0, -3)), null)
  assert.equal(readTrialToken(''), null)
  assert.equal(readTrialToken(null), null)
})

test('a link signed with another key opens nothing', async () => {
  const t = trialToken(sample)
  process.env.VENUE_LINK_SECRET = 'a-different-secret'
  assert.equal(readTrialToken(t), null)
  process.env.VENUE_LINK_SECRET = 'test-only-secret'
})
