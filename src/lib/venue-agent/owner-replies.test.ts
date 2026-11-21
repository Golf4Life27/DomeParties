import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planReply, sortReply, ownWords, signedName, type OwnerOffer } from './owner-replies'

const free: OwnerOffer = { venueName: 'Test Lanes', demoUrl: 'https://partydesk.ai/for-venues/demo/test', offer: 'free-month', lead: 'starter', currency: 'USD' }
const pilot: OwnerOffer = { ...free, offer: 'pilot', lead: 'pro', demoUrl: 'https://partydesk.ai/for-venues/demo/test?offer=pilot' }

test('a stop never gets an email and is logged do-not-contact', () => {
  for (const t of ['no thanks', 'Unsubscribe', 'STOP', 'please remove us from your list', 'Not interested.', "we're all set, thanks"]) {
    const p = planReply(t, free)
    assert.equal(p.kind, 'stop', t)
    assert.equal(p.email, null)
    assert.equal(p.doNotContact, true)
  }
})

test('a "not interested in X, but" question goes to a person, not a stop or a guess', () => {
  assert.equal(sortReply("Not interested in the pilot but what's the flat monthly?"), 'unsure')
})

test('quoted history is ignored, so our own footer never reads as their stop', () => {
  const t = 'Yes, lets do it\n\nOn Tue, Dec 1, 2026 at 9:00 AM Alex wrote:\n> If this isn\'t for you, reply "no thanks" and I won\'t write again.'
  assert.equal(ownWords(t), 'Yes, lets do it')
  assert.equal(sortReply(t), 'yes')
})

test('a yes gets the switch-on steps with the offer from its own email', () => {
  const p = planReply('sure, how do we get this on our site? we use wix\n- Dana', pilot)
  assert.equal(p.kind, 'yes')
  assert.match(p.email!.text, /^Hi Dana,/)
  assert.match(p.email!.text, /\$20 for each party request/)
  assert.match(p.email!.text, /Wix/)
  assert.match(p.email!.text, /offer=pilot/)
})

test('a price question is answered from the offer, with no per-request talk on the free-month offer', () => {
  const p = planReply('whats the catch, is there a contract?', free)
  assert.equal(p.kind, 'price')
  assert.match(p.email!.text, /first month is free/)
  assert.match(p.email!.text, /no contract/)
  assert.doesNotMatch(p.email!.text, /\$20/)
})

test('overseas offers are priced in their own money', () => {
  const p = planReply('how much is it?', { ...free, currency: 'GBP' })
  assert.match(p.email!.text, /£229/)
  assert.doesNotMatch(p.email!.text, /\$299/)
})

test('a signature name is picked up, a sign-off word is not', () => {
  assert.equal(signedName('ok sounds good\nThanks,\nMike'), 'Mike')
  assert.equal(signedName('ok sounds good\nThanks'), null)
})
