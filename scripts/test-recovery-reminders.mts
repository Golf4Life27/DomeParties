// Run: DATABASE_URL=<a throwaway local database> npx tsx scripts/test-recovery-reminders.mts
// Checks who gets an unfinished-booking reminder, and what it says, against a
// private database. Emails print to the console (no mail settings are set), so
// nothing is sent and no live data is read or written.
const { prisma } = await import('@/lib/db')
const booking = await import('@/lib/booking')
const { availability } = await import('@/lib/availability')
const { unsubscribeDraftsFor, RECOVERY_STOPPED, RECOVERY_UNSUBSCRIBED } = await import('@/lib/recovery')
const { addDays, todayStr } = await import('@/lib/time')

if (process.env.GMAIL_USER || process.env.RESEND_API_KEY) throw new Error('Mail settings present: refusing to run')
if (!/localhost|127\.0\.0\.1|host=\/tmp/.test(process.env.DATABASE_URL ?? '')) throw new Error('Not a local database')

await prisma.setting.update({
  where: { id: 1 },
  data: { cardFeePct: 3.5, depositPercent: 10, serviceChargePct: 20, serviceChargeOnGolf: true, taxPct: 0, leadTimeDaysOnline: 7 },
})
const small = await prisma.package.findFirstOrThrow({ where: { name: 'Birthday Party — Up to 10 Guests' } })

// A date 3 weeks out with an open slot, and one inside the 7-day online lead time.
let farDate = addDays(todayStr(), 21)
let slots = await availability.getSlots(farDate, 2, 120)
for (let i = 1; slots.length === 0 && i < 14; i++) {
  farDate = addDays(todayStr(), 21 + i)
  slots = await availability.getSlots(farDate, 2, 120)
}
const slot = slots[0].startMinutes
const nearDate = addDays(todayStr(), 3)
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000)

async function draft(email: string, opts: { date?: string; createdHoursAgo: number; slotMinutes?: number }) {
  const d = await booking.createDraft(email, 'BIRTHDAY')
  const data: Record<string, unknown> = { createdAt: hoursAgo(opts.createdHoursAgo) }
  if (opts.date) {
    Object.assign(data, {
      packageId: small.id, partySize: 6, date: new Date(`${opts.date}T00:00:00Z`),
      startMinutes: opts.slotMinutes ?? slot, endMinutes: (opts.slotMinutes ?? slot) + 120,
    })
  }
  await prisma.booking.update({ where: { id: d.id }, data })
  // updatedAt is managed by Prisma; age it with raw SQL so the 1-hour rule applies.
  await prisma.$executeRawUnsafe(`UPDATE "Booking" SET "updatedAt" = $1 WHERE id = $2`, hoursAgo(opts.createdHoursAgo), d.id)
  return d.id
}

const A_old = await draft('family-a@example.test', { date: farDate, createdHoursAgo: 2.1 }) // first try
const A_new = await draft('Family-A@example.test', { date: farDate, createdHoursAgo: 2.0 }) // restarted minutes later
const B = await draft('family-b@example.test', { createdHoursAgo: 3 }) // left at the email step
const C = await draft('family-c@example.test', { date: farDate, createdHoursAgo: 5 }) // paid on another try
const C_paid = await booking.createDraft('family-c@example.test', 'BIRTHDAY')
await prisma.booking.update({ where: { id: C_paid.id }, data: { status: 'CONFIRMED', depositPaid: true } })
const D = await draft('family-d@example.test', { date: farDate, createdHoursAgo: 2, slotMinutes: slot }) // slot will close
await prisma.closure.create({ data: { date: new Date(`${farDate}T00:00:00Z`), startMinute: 0, endMinute: 1440, reason: 'test: day blocked' } })
const E = await draft('family-e@example.test', { date: nearDate, createdHoursAgo: 2 }) // now inside lead time
const F = await draft('family-f@example.test', { createdHoursAgo: 0.2 }) // too fresh for the first touch

const stageOf = async (id: string) => (await prisma.booking.findUniqueOrThrow({ where: { id } })).recoveryStage

// Day D and family A share farDate, so test family A's emails first with D's
// closure lifted, then put it back for D.
await prisma.closure.deleteMany({})
const runA = await booking.sendRecoveryEmailsToStaleDrafts(60)
console.log('RUN 1 (closure off):', runA)
const results1 = {
  A_new: await stageOf(A_new), A_old: await stageOf(A_old), B: await stageOf(B), C: await stageOf(C),
  D: await stageOf(D), E: await stageOf(E), F: await stageOf(F),
}
console.log('stages after run 1:', results1)

const check = (label: string, ok: boolean) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
check('A newest try gets reminder 1', results1.A_new === 1)
check('A older duplicate is stopped, no email', results1.A_old === RECOVERY_STOPPED)
check('B (email only) gets the general reminder 1', results1.B === 1)
check('C already paid on another try: stopped', results1.C === RECOVERY_STOPPED)
check('E slot now inside the online lead time: stopped', results1.E === RECOVERY_STOPPED)
check('F too fresh: untouched', results1.F === 0)

// D's day closes after its first reminder; the 24-hour reminder must not go.
await prisma.closure.create({ data: { date: new Date(`${farDate}T00:00:00Z`), startMinute: 0, endMinute: 1440, reason: 'test: day blocked' } })
await prisma.booking.updateMany({ where: { id: { in: [A_new, D, B] } }, data: { recoveryEmailSentAt: hoursAgo(25) } })
// Family A's slot stays open: lift the closure only for A by moving A to another open date.
let otherDate = addDays(farDate, 1)
for (let i = 2; (await availability.getSlots(otherDate, 2, 120)).every((s) => s.startMinutes !== slot) && i < 14; i++) otherDate = addDays(farDate, i)
await prisma.booking.update({ where: { id: A_new }, data: { date: new Date(`${otherDate}T00:00:00Z`) } })
await unsubscribeDraftsFor('FAMILY-B@example.test')
const run2 = await booking.sendRecoveryEmailsToStaleDrafts(60)
console.log('RUN 2 (24h later):', run2)
check('A gets reminder 2 (slot still open)', (await stageOf(A_new)) === 2)
check('D reminder 2 not sent: slot gone', (await stageOf(D)) === RECOVERY_STOPPED)
check('B unsubscribed: reminder 2 not sent', (await stageOf(B)) === RECOVERY_UNSUBSCRIBED)
check('B new try after unsubscribing is skipped too', await (async () => {
  const B2 = await draft('family-b@example.test', { createdHoursAgo: 2 })
  await booking.sendRecoveryEmailsToStaleDrafts(60)
  return (await stageOf(B2)) === 0 && (await prisma.booking.findUniqueOrThrow({ where: { id: B2 } })).recoveryEmailSentAt === null
})())
await prisma.$disconnect()
