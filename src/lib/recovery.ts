import { prisma } from '@/lib/db'
import { availability } from '@/lib/availability'
import { baysFor, computeQuote } from '@/lib/pricing'

/**
 * Who should (and should not) get an unfinished-booking reminder.
 *
 * Kept out of booking.ts so the rules sit in one readable place. Nothing here
 * sends mail; it only decides, and reads the facts the email needs.
 */

/** recoveryStage values past the 3-touch sequence. Never reached by the queries. */
export const RECOVERY_STOPPED = 8 // reminders ended for this draft (paid elsewhere, slot gone, a newer try)
export const RECOVERY_UNSUBSCRIBED = 9 // the guest asked for no more reminders

type DraftFacts = {
  id: string
  createdAt: Date
  customerEmail: string | null
  packageId: string | null
  date: Date
  startMinutes: number
}

/** A draft that got as far as choosing a date and a start time. */
export function hasChosenSlot(b: { packageId: string | null; date: Date; startMinutes: number }) {
  return Boolean(b.packageId) && b.date.getUTCFullYear() > 1970 && b.startMinutes > 0
}

function progress(b: { packageId: string | null; date: Date; startMinutes: number }) {
  return hasChosenSlot(b) ? 2 : b.packageId ? 1 : 0
}

/**
 * Why this draft should NOT get a reminder, or null when it should.
 *
 * - unsubscribed: the address asked for no more reminders (on any of its drafts)
 * - booked: the same address already has a held or paid booking made since
 * - newer_try: the same family started again and got at least as far; families
 *   often restart two or three times in a few minutes, and each try used to get
 *   its own copy of every reminder
 * - slot_gone: the date and time they chose can no longer be booked online
 *   (taken, closed, or now inside the online lead time)
 */
export async function recoverySkipReason(
  b: DraftFacts,
): Promise<'unsubscribed' | 'booked' | 'newer_try' | 'slot_gone' | null> {
  if (!b.customerEmail) return 'unsubscribed'
  const email = b.customerEmail.trim()
  const siblings = await prisma.booking.findMany({
    where: { id: { not: b.id }, customerEmail: { equals: email, mode: 'insensitive' } },
    select: {
      id: true, status: true, depositPaid: true, createdAt: true, recoveryStage: true,
      packageId: true, date: true, startMinutes: true,
    },
  })
  const self = await prisma.booking.findUnique({ where: { id: b.id }, select: { recoveryStage: true } })
  if (self?.recoveryStage === RECOVERY_UNSUBSCRIBED || siblings.some((s) => s.recoveryStage === RECOVERY_UNSUBSCRIBED)) {
    return 'unsubscribed'
  }
  if (
    siblings.some(
      (s) =>
        s.createdAt >= b.createdAt &&
        (s.depositPaid || s.status === 'PENDING' || s.status === 'CONFIRMED' || s.status === 'COMPLETED'),
    )
  ) {
    return 'booked'
  }
  const mine = progress(b)
  if (
    siblings.some(
      (s) =>
        s.status === 'DRAFT' &&
        s.recoveryStage < RECOVERY_STOPPED &&
        (progress(s) > mine || (progress(s) === mine && s.createdAt > b.createdAt)),
    )
  ) {
    return 'newer_try'
  }
  if (hasChosenSlot(b) && !(await slotStillOpen(b))) return 'slot_gone'
  return null
}

/** Is the exact start time this draft chose still bookable online right now? */
export async function slotStillOpen(b: { packageId: string | null; date: Date; startMinutes: number; id?: string }) {
  if (!b.packageId) return false
  const [pkg, setting, self] = await Promise.all([
    prisma.package.findUnique({ where: { id: b.packageId } }),
    prisma.setting.findUniqueOrThrow({ where: { id: 1 } }),
    b.id ? prisma.booking.findUnique({ where: { id: b.id }, select: { partySize: true } }) : Promise.resolve(null),
  ])
  if (!pkg || !pkg.active) return false
  const partySize = self?.partySize ?? 1
  const baysNeeded =
    pkg.pricingType === 'BAY_RATE'
      ? pkg.dynamicBays
        ? Math.max(pkg.bays, baysFor(partySize, setting.bayCapacity))
        : pkg.bays
      : baysFor(partySize, setting.bayCapacity)
  const dateStr = b.date.toISOString().slice(0, 10)
  const slots = await availability.getSlots(dateStr, baysNeeded, pkg.durationMinutes)
  return slots.some((s) => s.startMinutes === b.startMinutes)
}

/** The facts a slot reminder shows: party size, total, and what's due today. */
export async function slotReminderFacts(id: string) {
  const b = await prisma.booking.findUniqueOrThrow({
    where: { id },
    include: { addOns: true, package: { select: { name: true } } },
  })
  if (!hasChosenSlot(b) || !b.packageId) return null
  const dateStr = b.date.toISOString().slice(0, 10)
  const [quote, setting] = await Promise.all([
    computeQuote({
      partySize: b.partySize,
      fnbGuests: b.fnbGuests,
      packageId: b.packageId,
      fnbPackageId: b.fnbPackageId,
      addOns: b.addOns.map((a) => ({ addOnId: a.addOnId, quantity: a.quantity })),
      dateStr,
      startMinutes: b.startMinutes,
    }),
    prisma.setting.findUniqueOrThrow({ where: { id: 1 } }),
  ])
  // Same sum the payment step charges: the deposit plus any card fee on it.
  const cardFee = setting.cardFeePct > 0 ? Math.round((quote.depositAmount * setting.cardFeePct) / 100) : 0
  return {
    dateStr,
    startMinutes: b.startMinutes,
    guests: b.partySize + (b.fnbGuests ?? 0),
    total: quote.total,
    dueToday: quote.depositAmount + cardFee,
  }
}

/** Stop reminders for every draft on this address (the unsubscribe link). */
export async function unsubscribeDraftsFor(email: string) {
  const res = await prisma.booking.updateMany({
    where: { status: 'DRAFT', customerEmail: { equals: email.trim(), mode: 'insensitive' } },
    data: { recoveryStage: RECOVERY_UNSUBSCRIBED },
  })
  return res.count
}
