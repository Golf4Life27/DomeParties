import { prisma } from '@/lib/db'

export type FunnelStats = {
  started: number
  drafts: number
  pending: number
  confirmed: number
  cancelled: number
  conversionPct: number
  revenueBooked: number // cents, confirmed
  depositsCollected: number // cents
  aov: number // cents, avg confirmed total
  upsellTakePct: number // % confirmed with >=1 add-on
  addOnRevenue: number // cents from add-ons on confirmed
  leadsNew: number
}

/** Revenue-funnel KPIs for the admin overview. */
export async function getFunnelStats(): Promise<FunnelStats> {
  const [byStatus, confirmedAgg, depositsAgg, confirmedWithAddOns, addOnAgg, leadsNew] =
    await Promise.all([
      prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.booking.aggregate({
        where: { status: 'CONFIRMED' },
        _sum: { total: true },
        _avg: { total: true },
        _count: { _all: true },
      }),
      prisma.booking.aggregate({
        where: { depositPaid: true },
        _sum: { depositAmount: true },
      }),
      prisma.booking.count({
        where: { status: 'CONFIRMED', addOns: { some: {} } },
      }),
      prisma.bookingAddOn.aggregate({
        where: { booking: { status: 'CONFIRMED' } },
        _sum: { lineTotal: true },
      }),
      prisma.lead.count({ where: { status: 'NEW' } }),
    ])

  const counts: Record<string, number> = {}
  for (const row of byStatus) counts[row.status] = row._count._all
  const drafts = counts.DRAFT ?? 0
  const pending = counts.PENDING ?? 0
  const confirmed = counts.CONFIRMED ?? 0
  const cancelled = counts.CANCELLED ?? 0
  const completed = counts.COMPLETED ?? 0
  const started = drafts + pending + confirmed + cancelled + completed
  const confirmedCount = confirmedAgg._count._all || 0

  return {
    started,
    drafts,
    pending,
    confirmed,
    cancelled,
    conversionPct: started ? Math.round((confirmed / started) * 100) : 0,
    revenueBooked: confirmedAgg._sum.total ?? 0,
    depositsCollected: depositsAgg._sum.depositAmount ?? 0,
    aov: Math.round(confirmedAgg._avg.total ?? 0),
    upsellTakePct: confirmedCount ? Math.round((confirmedWithAddOns / confirmedCount) * 100) : 0,
    addOnRevenue: addOnAgg._sum.lineTotal ?? 0,
    leadsNew,
  }
}
