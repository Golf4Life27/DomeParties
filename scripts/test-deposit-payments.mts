// Run: DATABASE_URL=<a throwaway local database> STRIPE_SECRET_KEY=sk_test_fake STRIPE_WEBHOOK_SECRET=whsec_test npx tsx scripts/test-deposit-payments.mts
// Local reproduction of the WTR-9U6NM / WTR-QJU57 sequence against a private
// database and an in-memory fake Stripe. Never touches live data.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

type PI = { id: string; amount: number; amount_received: number; status: string; client_secret: string; metadata: Record<string, string>; livemode: boolean }
const store = new Map<string, PI>()
let n = 0
const fake = {
  async create(p: { amount: number; metadata: Record<string, string> }) {
    const id = `pi_fake_${++n}`
    const pi: PI = { id, amount: p.amount, amount_received: 0, status: 'requires_payment_method', client_secret: `${id}_secret`, metadata: p.metadata, livemode: false }
    store.set(id, pi); return { ...pi }
  },
  async retrieve(id: string) { const pi = store.get(id); if (!pi) throw new Error('no such intent'); return { ...pi } },
  async update(id: string, p: { amount: number }) { const pi = store.get(id)!; pi.amount = p.amount; return { ...pi } },
  async cancel(id: string) { const pi = store.get(id)!; if (pi.status === 'succeeded') throw new Error('cannot cancel'); pi.status = 'canceled'; return { ...pi } },
  async search(p: { query: string }) {
    const m = /metadata\['bookingId'\]:'([^']+)'/.exec(p.query)
    return { data: [...store.values()].filter((x) => x.metadata.bookingId === m?.[1] && x.status === 'succeeded').map((x) => ({ ...x })) }
  },
}
const root = require.resolve('stripe').replace(/(node_modules\/stripe\/).*/, '$1')
Object.assign(require(root + 'cjs/resources/PaymentIntents.js').PaymentIntentResource.prototype, fake)
const esm = await import(root + 'esm/resources/PaymentIntents.js').catch(() => null)
if (esm) Object.assign(esm.PaymentIntentResource.prototype, fake)

/** Guest pays an intent (what Stripe does when the mounted form confirms it). */
function guestPays(id: string) { const pi = store.get(id)!; pi.status = 'succeeded'; pi.amount_received = pi.amount; return pi }

const { prisma } = await import('@/lib/db')
const booking = await import('@/lib/booking')
const { POST: webhook } = await import('@/app/api/webhooks/stripe/route')
const { POST: applyPromo } = await import('@/app/api/bookings/[id]/apply-promo/route')
const { getStripe } = await import('@/lib/stripe')
const { NextRequest } = await import('next/server')

async function sendWebhook(pi: PI) {
  const stripe = getStripe()!
  const payload = JSON.stringify({ id: `evt_${pi.id}`, object: 'event', type: 'payment_intent.succeeded', livemode: false, data: { object: pi } })
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! })
  const res = await webhook(new NextRequest('http://local/api/webhooks/stripe', { method: 'POST', body: payload, headers: { 'stripe-signature': header } }))
  return res.status
}

await prisma.setting.update({ where: { id: 1 }, data: { cardFeePct: 3.5, depositPercent: 10, serviceChargePct: 20, serviceChargeOnGolf: true, taxPct: 0, staffNotifyEmail: 'staff@example.test' } })
await prisma.promoCode.upsert({ where: { code: 'PARTY40' }, update: { active: true }, create: { code: 'PARTY40', amountOff: 4000, appliesDays: [] } })
const pkg = await prisma.package.findFirstOrThrow({ where: { name: 'Birthday Party — Up to 10 Guests' } })

async function heldBooking(label: string) {
  const d = await booking.createDraft(`${label}@example.test`, 'BIRTHDAY')
  // A Saturday 7+ weeks out, 1pm, 8 golfers — the WTR-9U6NM shape.
  await prisma.booking.update({ where: { id: d.id }, data: {
    date: new Date('2027-01-09T00:00:00Z'), startMinutes: 780, endMinutes: 900, partySize: 8, packageId: pkg.id,
    customerName: `Test ${label}`, waiverSigned: true, status: 'PENDING', baysNeeded: 2,
    packageTotal: 22000, serviceCharge: 4400, total: 26400, depositAmount: 2640, balanceDue: 23760,
    holdExpiresAt: new Date(Date.now() + 30 * 60_000),
  } })
  return d.id
}
const promo = (id: string) => applyPromo(new NextRequest(`http://local/api/bookings/${id}/apply-promo`, { method: 'POST', body: JSON.stringify({ code: 'PARTY40' }), headers: { 'content-type': 'application/json' } }), { params: Promise.resolve({ id }) })
const results: string[] = []
const check = (name: string, ok: boolean, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)

// 1. The real sequence: pay page opens, guest applies the promo, then pays from the form already on screen.
{
  const id = await heldBooking('promo-then-pay')
  const first = await booking.createDepositIntent(id)
  await promo(id)
  const second = await booking.createDepositIntent(id)
  const formIntent = (first as { clientSecret: string }).clientSecret.replace('_secret', '')
  const paid = guestPays(formIntent)
  const status = await sendWebhook(paid)
  const b = await prisma.booking.findUniqueOrThrow({ where: { id } })
  check('promo after form opened: one intent, not two', first.clientSecret === second.clientSecret, `${first.clientSecret} vs ${second.clientSecret}`)
  check('guest is charged the promo price, not the old one', paid.amount === 2318, `charged ${paid.amount} (deposit 22.40 + 3.5%)`)
  check('booking confirmed and paid', status === 200 && b.depositPaid && b.status !== 'DRAFT', `status=${b.status} depositPaid=${b.depositPaid}`)
}

// 2. A stale, LARGER intent from an older tab gets paid (the WTR-9U6NM money): confirm, flag the overpay.
{
  const id = await heldBooking('stale-larger')
  const stale = await fake.create({ amount: 3146, metadata: { bookingId: id, kind: 'deposit', reference: 'X' } })
  await promo(id)
  const fresh = await fake.create({ amount: 2318, metadata: { bookingId: id, kind: 'deposit', reference: 'X' } })
  await prisma.booking.update({ where: { id }, data: { stripePaymentIntentId: fresh.id } })
  await sendWebhook(guestPays(stale.id))
  const b = await prisma.booking.findUniqueOrThrow({ where: { id } })
  check('older larger payment confirms the booking', b.depositPaid && b.stripePaymentIntentId === stale.id, `depositPaid=${b.depositPaid} intent=${b.stripePaymentIntentId}`)
  check('the replaced intent is retired so it cannot be paid too', store.get(fresh.id)!.status === 'canceled')
}

// 3. A stale SMALLER intent must still not mark a bigger price paid — and the hold must not lapse.
{
  const id = await heldBooking('stale-smaller')
  const small = await fake.create({ amount: 1000, metadata: { bookingId: id, kind: 'deposit', reference: 'X' } })
  const cur = await fake.create({ amount: 2732, metadata: { bookingId: id, kind: 'deposit', reference: 'X' } })
  await prisma.booking.update({ where: { id }, data: { stripePaymentIntentId: cur.id } })
  await sendWebhook(guestPays(small.id))
  const b = await prisma.booking.findUniqueOrThrow({ where: { id } })
  check('underpayment is not recorded as paid', !b.depositPaid && b.needsReview)
  check('underpaid booking keeps its bays (hold no longer lapses)', b.holdExpiresAt === null)
  const rel = await booking.releaseExpiredHolds()
  const after = await prisma.booking.findUniqueOrThrow({ where: { id } })
  check('hold release leaves it alone', after.status === 'PENDING', `released=${rel.released} status=${after.status}`)
}

// 4. The WTR-QJU57 state: money in Stripe, booking already lapsed to DRAFT. Staff press Approve.
{
  const id = await heldBooking('lapsed-draft')
  const paidPi = await fake.create({ amount: 2732, metadata: { bookingId: id, kind: 'deposit', reference: 'X' } })
  guestPays(paidPi.id)
  await prisma.booking.update({ where: { id }, data: { status: 'DRAFT', holdExpiresAt: null, needsReview: false, stripePaymentIntentId: 'pi_other' } })
  let err = ''
  try { await booking.approveBooking(id) } catch (e) { err = String(e) }
  const b = await prisma.booking.findUniqueOrThrow({ where: { id }, include: { resources: true } })
  check('staff Approve finds the Stripe payment and confirms', b.status === 'CONFIRMED' && b.depositPaid && b.stripePaymentIntentId === paidPi.id, err || `status=${b.status} bays=${b.resources.length}`)
}

// 5. Approve with no money anywhere still refuses.
{
  const id = await heldBooking('no-money')
  let err = ''
  try { await booking.approveBooking(id) } catch (e) { err = String(e) }
  check('Approve with no payment still refuses', /Deposit not yet paid/.test(err), err)
}

// 6. Pay link opened twice after paying: no second charge is opened.
{
  const id = await heldBooking('reopen-after-pay')
  const a = await booking.createDepositIntent(id)
  guestPays(a.clientSecret!.replace('_secret', ''))
  const again = await booking.createDepositIntent(id)
  check('reopening the pay page after paying opens no new charge', again.mode === 'paid', `mode=${again.mode}`)
}

console.log(results.join('\n'))
await prisma.$disconnect()
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
