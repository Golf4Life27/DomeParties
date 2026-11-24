import { prisma } from '@/lib/db'
import { isTestEmail } from '@/lib/test-accounts'

/** The seven screens of /book, in order (mirrors STEPS in src/app/book/page.tsx). */
export const BOOKING_STEPS = ['Start', 'Package', 'Date & time', 'Food & drink', 'Add-ons', 'Your details', 'Pay'] as const

export type StepRow = {
  step: (typeof BOOKING_STEPS)[number] | 'Paid'
  /** Families who got past this step. null = not recorded yet. */
  passed: number | null
  /** Families whose furthest point was this step. null = not recorded yet. */
  stoppedHere: number | null
  note?: string
}

export type FunnelStats = {
  /** Unique families (by email) who started a booking, tests excluded. */
  startedFamilies: number
  startedTries: number
  pending: number
  /** Paid parties: deposit paid and not cancelled (confirmed, completed, or awaiting review). */
  paid: number
  paidUpcoming: number
  paidPast: number
  testPaid: number
  cancelled: number
  conversionPct: number
  revenueBooked: number // cents, paid parties
  depositsCollected: number // cents, paid parties
  aov: number // cents, avg paid party total
  upsellTakePct: number // % paid parties with >=1 add-on
  addOnRevenue: number // cents from add-ons on paid parties
  /** Families who started and never booked, counted once each. */
  abandonedFamilies: number
  abandonedTries: number
  leadsNew: number
  steps: StepRow[]
}

const PAID_STATUSES = ['PENDING', 'CONFIRMED', 'COMPLETED'] as const

/** Furthest step a single try reached, 0-based into BOOKING_STEPS; 7 = paid. */
function furthestStep(b: {
  status: string
  packageId: string | null
  startMinutes: number
  date: Date
  customerName: string | null
  waiverSigned: boolean
  stripePaymentIntentId: string | null
  depositPaid: boolean
  furthestStep: number
}): number {
  if (b.depositPaid && b.status !== 'CANCELLED') return 7
  return Math.max(inferredStep(b), b.furthestStep)
}

/** What the saved fields alone say about how far a try got (older tries). */
function inferredStep(b: Parameters<typeof furthestStep>[0]): number {
  // Name, waiver and the hold are all saved together when "Your details" is
  // submitted, so any of them means the family reached Pay.
  if (b.status !== 'DRAFT' || b.stripePaymentIntentId || b.customerName || b.waiverSigned) return 6
  // A time is saved on the Date & time screen; the next screen is Food & drink.
  // Food & drink and Add-ons save nothing on Continue, so a family stopped on
  // either of them, or on Your details, looks the same today.
  const hasTime = b.startMinutes > 0 && b.date.getUTCFullYear() > 1971
  if (hasTime) return 3
  if (b.packageId) return 2
  return 1
}

/** Revenue-funnel KPIs for the admin overview. Staff test bookings are left out. */
export async function getFunnelStats(): Promise<FunnelStats> {
  const [bookings, leadsNew] = await Promise.all([
    prisma.booking.findMany({
      select: {
        status: true,
        customerEmail: true,
        customerName: true,
        packageId: true,
        startMinutes: true,
        date: true,
        waiverSigned: true,
        stripePaymentIntentId: true,
        depositPaid: true,
        furthestStep: true,
        depositAmount: true,
        total: true,
        addOnsTotal: true,
        _count: { select: { addOns: true } },
      },
    }),
    prisma.lead.count({ where: { status: 'NEW' } }),
  ])

  const real = bookings.filter((b) => !isTestEmail(b.customerEmail))
  const isPaid = (b: (typeof bookings)[number]) =>
    b.depositPaid && (PAID_STATUSES as readonly string[]).includes(b.status)

  const paid = real.filter(isPaid)
  const testPaid = bookings.filter((b) => isPaid(b) && isTestEmail(b.customerEmail)).length
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // One row per family (lower-cased email); tries with no email count alone.
  const families = new Map<string, number>()
  const tracked = new Set<string>() // families whose tries recorded each screen
  real.forEach((b, i) => {
    const key = b.customerEmail?.trim().toLowerCase() || `__noemail_${i}`
    families.set(key, Math.max(families.get(key) ?? 0, furthestStep(b)))
    if (b.furthestStep > 0) tracked.add(key)
  })
  const furthest = [...families.values()]
  // Families from before step tracking who stopped between Food & drink and
  // Your details: we can't tell which of the three screens.
  const unsplitOlder = [...families].filter(([k, f]) => f === 3 && !tracked.has(k)).length
  const trackedStoppedAt = (s: number) => [...families].filter(([k, f]) => f === s && tracked.has(k)).length
  const startedFamilies = furthest.length
  const abandonedFamilies = furthest.filter((s) => s < 7).length

  const stoppedAt = (s: number) => furthest.filter((f) => f === s).length
  const passedAfter = (s: number) => furthest.filter((f) => f > s).length
  const steps: StepRow[] = [
    { step: 'Start', passed: passedAfter(0), stoppedHere: stoppedAt(0) },
    { step: 'Package', passed: passedAfter(1), stoppedHere: stoppedAt(1) },
    { step: 'Date & time', passed: passedAfter(2), stoppedHere: stoppedAt(2) },
    {
      step: 'Food & drink',
      passed: passedAfter(3),
      stoppedHere: trackedStoppedAt(3),
      note: unsplitOlder
        ? `Plus ${unsplitOlder} earlier ${unsplitOlder === 1 ? 'family' : 'families'} who stopped somewhere from here to Your details, before each screen was recorded`
        : undefined,
    },
    { step: 'Add-ons', passed: passedAfter(4), stoppedHere: trackedStoppedAt(4) },
    { step: 'Your details', passed: passedAfter(5), stoppedHere: trackedStoppedAt(5) },
    { step: 'Pay', passed: passedAfter(6), stoppedHere: stoppedAt(6) },
    { step: 'Paid', passed: stoppedAt(7), stoppedHere: null },
  ]

  const revenueBooked = paid.reduce((s, b) => s + b.total, 0)
  const withAddOns = paid.filter((b) => b._count.addOns > 0).length

  return {
    startedFamilies,
    startedTries: real.length,
    pending: real.filter((b) => b.status === 'PENDING' && !b.depositPaid).length,
    paid: paid.length,
    paidUpcoming: paid.filter((b) => b.date >= today).length,
    paidPast: paid.filter((b) => b.date < today).length,
    testPaid,
    cancelled: real.filter((b) => b.status === 'CANCELLED').length,
    conversionPct: startedFamilies ? Math.round((furthest.filter((s) => s === 7).length / startedFamilies) * 100) : 0,
    revenueBooked,
    depositsCollected: paid.reduce((s, b) => s + b.depositAmount, 0),
    aov: paid.length ? Math.round(revenueBooked / paid.length) : 0,
    upsellTakePct: paid.length ? Math.round((withAddOns / paid.length) * 100) : 0,
    addOnRevenue: paid.reduce((s, b) => s + b.addOnsTotal, 0),
    abandonedFamilies,
    abandonedTries: real.filter((b) => b.status === 'DRAFT').length,
    leadsNew,
    steps,
  }
}

/**
 * Paid parties booked this calendar month (venue time), tests excluded. Used by
 * the public home page. A party stays counted after its date passes.
 */
export async function partiesBookedThisMonth(): Promise<number> {
  const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).format(new Date())
  // Venue midnight on the 1st, as an instant. Chicago is UTC-5 or UTC-6; a
  // 6-hour cushion plus the exact month check below keeps the edge right.
  const roughStart = new Date(`${ym}-01T00:00:00.000Z`)
  roughStart.setUTCHours(-6)
  const rows = await prisma.booking.findMany({
    where: {
      depositPaid: true,
      status: { in: [...PAID_STATUSES] },
      OR: [{ paidAt: { gte: roughStart } }, { paidAt: null, createdAt: { gte: roughStart } }],
    },
    select: { customerEmail: true, paidAt: true, createdAt: true },
  })
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' })
  return rows.filter((r) => !isTestEmail(r.customerEmail) && fmt.format(r.paidAt ?? r.createdAt) === ym).length
}
