import Link from 'next/link'
import { prisma } from '@/lib/db'
import { getFunnelStats } from '@/lib/admin-stats'
import { formatCents } from '@/lib/money'
import { minutesToLabel } from '@/lib/time'
import { StatusBadge } from './StatusBadge'

export const dynamic = 'force-dynamic'

export default async function AdminOverview() {
  const [stats, upcoming, recent] = await Promise.all([
    getFunnelStats(),
    prisma.booking.findMany({
      where: { status: 'CONFIRMED', date: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
      orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }],
      take: 8,
      include: { package: true },
    }),
    prisma.booking.findMany({
      where: { status: { in: ['CONFIRMED', 'PENDING'] } },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      include: { package: true },
    }),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Overview</h1>
      <p className="mt-1 text-foreground/60">Your revenue funnel at a glance.</p>

      {/* KPI cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Revenue booked" value={formatCents(stats.revenueBooked)} sub={`${stats.confirmed} confirmed events`} accent />
        <Kpi label="Deposits collected" value={formatCents(stats.depositsCollected)} sub="Cash in the door" />
        <Kpi label="Avg order value" value={formatCents(stats.aov)} sub="Per confirmed event" />
        <Kpi label="Conversion" value={`${stats.conversionPct}%`} sub={`${stats.confirmed}/${stats.started} started → booked`} />
        <Kpi label="Upsell take-rate" value={`${stats.upsellTakePct}%`} sub={`${formatCents(stats.addOnRevenue)} add-on revenue`} />
        <Kpi label="In progress" value={String(stats.pending)} sub="Awaiting deposit" />
        <Kpi label="Abandoned carts" value={String(stats.drafts)} sub="Recovery targets" />
        <Kpi label="New leads" value={String(stats.leadsNew)} sub={<Link href="/admin/bookings" className="text-brand hover:underline">View bookings →</Link>} />
      </div>

      {/* Funnel bar */}
      <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h2 className="font-semibold text-brand-dark">Booking funnel</h2>
        <div className="mt-4 space-y-2">
          <FunnelRow label="Started (email captured)" count={stats.started} max={stats.started} />
          <FunnelRow label="Reached payment (held)" count={stats.pending + stats.confirmed} max={stats.started} />
          <FunnelRow label="Confirmed (deposit paid)" count={stats.confirmed} max={stats.started} accent />
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Upcoming events" href="/admin/bookings">
          {upcoming.length === 0 ? (
            <Empty>No upcoming confirmed events yet.</Empty>
          ) : (
            <ul className="divide-y divide-black/5">
              {upcoming.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <Link href={`/admin/bookings/${b.id}`} className="font-medium text-brand-dark hover:underline">
                      {b.customerName ?? b.reference}
                    </Link>
                    <span className="block text-xs text-foreground/50">
                      {b.date.toISOString().slice(0, 10)} · {minutesToLabel(b.startMinutes)} · {b.partySize} guests · {b.package?.name}
                    </span>
                  </span>
                  <span className="font-semibold">{formatCents(b.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent activity" href="/admin/bookings">
          {recent.length === 0 ? (
            <Empty>No bookings yet.</Empty>
          ) : (
            <ul className="divide-y divide-black/5">
              {recent.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <Link href={`/admin/bookings/${b.id}`} className="font-medium text-brand-dark hover:underline">
                      {b.reference}
                    </Link>
                    <span className="block text-xs text-foreground/50">
                      {b.customerName ?? '—'} · {b.package?.name ?? '—'}
                    </span>
                  </span>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: React.ReactNode
  accent?: boolean
}) {
  return (
    <div className={`rounded-2xl p-5 shadow-sm ring-1 ring-black/5 ${accent ? 'bg-brand text-white' : 'bg-white'}`}>
      <div className={`text-xs font-medium ${accent ? 'text-white/80' : 'text-foreground/50'}`}>{label}</div>
      <div className="mt-1 text-2xl font-extrabold">{value}</div>
      {sub && <div className={`mt-1 text-xs ${accent ? 'text-white/80' : 'text-foreground/50'}`}>{sub}</div>}
    </div>
  )
}

function FunnelRow({ label, count, max, accent }: { label: string; count: number; max: number; accent?: boolean }) {
  const pct = max ? Math.round((count / max) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-foreground/70">{label}</span>
        <span className="font-medium">{count}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-black/5">
        <div className={`h-2 rounded-full ${accent ? 'bg-accent' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Panel({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-brand-dark">{title}</h2>
        <Link href={href} className="text-xs text-brand hover:underline">
          See all →
        </Link>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-sm text-foreground/50">{children}</p>
}
