import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'

// TEMPORARY, READ-ONLY. Answers 404 anywhere except the staff-check preview.
// Reads bookings, leads and Stripe payments so the staff Overview fixes can be
// measured before and after. Writes nothing. Delete this branch when done.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: Request) {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'staff-check') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const part = new URL(req.url).searchParams.get('part') ?? 'summary'

  if (part === 'migrations') {
    const rows = await prisma.$queryRawUnsafe(
      `select migration_name, finished_at from _prisma_migrations order by started_at desc limit 15`,
    )
    const enumVals = await prisma.$queryRawUnsafe(
      `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'LeadStatus'`,
    )
    const leadCols = await prisma.$queryRawUnsafe(
      `select column_name from information_schema.columns where table_name = 'Lead'`,
    )
    return NextResponse.json({ rows, enumVals, leadCols })
  }

  const bookings = await prisma.booking.findMany({
    select: {
      id: true, reference: true, status: true, eventType: true, date: true, startMinutes: true,
      partySize: true, packageId: true, fnbPackageId: true, customerName: true, customerEmail: true,
      waiverSigned: true, depositPaid: true, depositAmount: true, total: true, paidAt: true,
      stripePaymentIntentId: true, needsReview: true, createdAt: true, updatedAt: true,
      recoveryStage: true, _count: { select: { addOns: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  const leads = await prisma.lead.findMany({
    select: {
      id: true, status: true, eventType: true, customerName: true, customerEmail: true, source: true,
      headcountMin: true, headcountMax: true, preferredDate: true, message: true, createdAt: true, updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  if (part === 'leads') {
    return NextResponse.json(
      leads.map((l) => ({ ...l, message: l.message ? l.message.slice(0, 140) : null })),
    )
  }
  if (part === 'bookings') {
    return NextResponse.json(
      bookings.filter((b) => b.status !== 'DRAFT' || b.depositPaid || b.stripePaymentIntentId),
    )
  }

  // Stripe deposits that succeeded, matched to bookings.
  const stripe = getStripe()
  const pis: { id: string; amount: number; created: number; bookingId?: string; ref?: string; kind?: string }[] = []
  if (stripe) {
    for await (const pi of stripe.paymentIntents.list({ limit: 100 })) {
      if (pi.status !== 'succeeded') continue
      pis.push({ id: pi.id, amount: pi.amount, created: pi.created, bookingId: pi.metadata?.bookingId, ref: pi.metadata?.reference, kind: pi.metadata?.kind })
    }
  }
  const byId = new Map(bookings.map((b) => [b.id, b]))
  const paidByStripe = pis
    .filter((p) => p.kind === 'deposit' && p.bookingId)
    .map((p) => {
      const b = byId.get(p.bookingId!)
      return { ref: p.ref, amount: p.amount, created: new Date(p.created * 1000), status: b?.status ?? 'MISSING', depositPaid: b?.depositPaid ?? null }
    })

  const status: Record<string, number> = {}
  for (const b of bookings) status[b.status] = (status[b.status] ?? 0) + 1
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const confirmedThisMonth = bookings
    .filter((b) => b.status === 'CONFIRMED' && b.createdAt >= monthStart)
    .map((b) => ({ ref: b.reference, createdAt: b.createdAt, date: b.date, name: b.customerName }))
  const paidThisMonth = bookings
    .filter((b) => (b.paidAt ?? b.createdAt) >= monthStart && b.depositPaid)
    .map((b) => ({ ref: b.reference, status: b.status, paidAt: b.paidAt, date: b.date }))

  // Families: drafts grouped by email; which later booked.
  const paidEmails = new Map<string, Date>()
  for (const b of bookings) {
    if (!b.customerEmail) continue
    if (b.depositPaid || b.status === 'CONFIRMED' || b.status === 'COMPLETED') {
      const e = b.customerEmail.toLowerCase()
      const prev = paidEmails.get(e)
      if (!prev || b.createdAt < prev) paidEmails.set(e, b.createdAt)
    }
  }
  const drafts = bookings.filter((b) => b.status === 'DRAFT')
  const draftEmails = new Set(drafts.map((b) => (b.customerEmail ?? '').toLowerCase()).filter(Boolean))
  const draftsNotLaterBooked = [...draftEmails].filter((e) => !paidEmails.has(e))

  // Step reach, inferred from what each try saved.
  const reach = (b: (typeof bookings)[number]) => {
    const hasTime = b.startMinutes > 0 && b.date.getUTCFullYear() > 1971
    const details = Boolean(b.customerName) || b.waiverSigned
    const atPay = b.status !== 'DRAFT' || Boolean(b.stripePaymentIntentId) || b.depositPaid
    if (b.depositPaid) return 8
    if (atPay) return 7
    if (details) return 6
    if (b._count.addOns > 0) return 5
    if (b.fnbPackageId || hasTime) return hasTime ? 4 : 3
    if (b.packageId) return 3
    return 2
  }
  const reachCounts: Record<number, number> = {}
  for (const b of bookings) {
    const r = reach(b)
    reachCounts[r] = (reachCounts[r] ?? 0) + 1
  }

  const outageFrom = new Date('2026-10-31T00:00:00Z')
  const outageTo = new Date('2026-11-04T15:40:00Z')
  const outageLeads = leads
    .filter((l) => l.createdAt >= outageFrom && l.createdAt <= outageTo)
    .map((l) => ({ name: l.customerName, createdAt: l.createdAt, status: l.status, source: l.source, headcount: [l.headcountMin, l.headcountMax], date: l.preferredDate, type: l.eventType }))
  const outageBookings = bookings
    .filter((b) => b.createdAt >= outageFrom && b.createdAt <= outageTo && b.status !== 'DRAFT')
    .map((b) => ({ ref: b.reference, name: b.customerName, status: b.status, depositPaid: b.depositPaid, date: b.date, createdAt: b.createdAt }))

  return NextResponse.json({
    total: bookings.length,
    status,
    depositPaidCount: bookings.filter((b) => b.depositPaid).length,
    depositPaidByStatus: bookings.filter((b) => b.depositPaid).reduce<Record<string, number>>((a, b) => ((a[b.status] = (a[b.status] ?? 0) + 1), a), {}),
    stripeDeposits: paidByStripe,
    stripeOtherKinds: pis.filter((p) => p.kind !== 'deposit').map((p) => ({ kind: p.kind, ref: p.ref, amount: p.amount })),
    confirmedThisMonth,
    paidThisMonth,
    draftTries: drafts.length,
    draftFamilies: draftEmails.size,
    draftFamiliesNeverBooked: draftsNotLaterBooked.length,
    reachCounts,
    leadsByStatus: leads.reduce<Record<string, number>>((a, l) => ((a[l.status] = (a[l.status] ?? 0) + 1), a), {}),
    outageLeads,
    outageBookings,
  })
}
