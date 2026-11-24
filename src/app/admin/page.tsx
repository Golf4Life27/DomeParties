import Link from 'next/link'
import { prisma } from '@/lib/db'
import { getFunnelStats } from '@/lib/admin-stats'
import { getEmailHealth } from '@/lib/email-outbox'
import { formatCents } from '@/lib/money'
import { minutesToLabel, todayVenueMidnight } from '@/lib/time'
import { StatusBadge } from './StatusBadge'

export const dynamic = 'force-dynamic'

export default async function AdminOverview() {
  const [stats, upcoming, recent, needsReviewCount, unpaidBalances, newLeadCount, todayCount, emailHealth] =
    await Promise.all([
      getFunnelStats(),
      prisma.booking.findMany({
        where: { status: 'CONFIRMED', date: { gte: todayVenueMidnight() } },
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
      prisma.booking.count({ where: { status: 'PENDING', depositPaid: true, needsReview: true } }),
      prisma.booking.count({
        where: { status: 'CONFIRMED', balancePaid: false, balanceDue: { gt: 0 }, date: { gte: todayVenueMidnight() } },
      }),
      prisma.lead.count({ where: { status: 'NEW' } }),
      prisma.booking.count({
        where: {
          date: todayVenueMidnight(),
          OR: [{ status: 'CONFIRMED' }, { status: 'PENDING', depositPaid: true }],
        },
      }),
      getEmailHealth().catch(() => null),
    ])

  const actions: { label: string; href: string; urgent?: boolean }[] = []
  if (needsReviewCount > 0)
    actions.push({
      label: `${needsReviewCount} paid booking${needsReviewCount === 1 ? '' : 's'} awaiting your review`,
      href: '/admin/bookings',
      urgent: true,
    })
  if (newLeadCount > 0) actions.push({ label: `${newLeadCount} new lead${newLeadCount === 1 ? '' : 's'} to answer`, href: '/admin/leads' })
  if (todayCount > 0) actions.push({ label: `${todayCount} event${todayCount === 1 ? '' : 's'} today — see the run sheet`, href: '/admin/day' })
  if (unpaidBalances > 0) actions.push({ label: `${unpaidBalances} upcoming event${unpaidBalances === 1 ? '' : 's'} with unpaid balances`, href: '/admin/bookings' })

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Overview</h1>
      <p className="mt-1 text-foreground/60">Your revenue funnel at a glance.</p>

      {/* Outage safety net: say so loudly when the site's emails are failing. */}
      {emailHealth?.failing && (
        <div className="mt-6 rounded-xl bg-red-600 px-5 py-4 text-white shadow-sm">
          <div className="font-bold">⚠️ The site’s emails are failing</div>
          <div className="mt-1 text-sm text-white/90">
            {emailHealth.held > 0
              ? `${emailHealth.held} email${emailHealth.held === 1 ? ' is' : 's are'} held (staff alerts, guest auto-replies or confirmations) and will retry every hour. `
              : 'The last send failed. '}
            {emailHealth.gaveUp > 0 && `${emailHealth.gaveUp} stopped retrying after three days. `}
            Check new leads and bookings here directly until this clears.
          </div>
        </div>
      )}

      {/* Needs-your-attention queue — the daily to-do, one glance */}
      {actions.length > 0 && (
        <div className="mt-6 space-y-2">
          {actions.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className={`flex items-center justify-between rounded-xl px-5 py-3 font-semibold shadow-sm ring-1 transition ${
                a.urgent
                  ? 'bg-red-50 text-red-800 ring-red-200 hover:bg-red-100'
                  : 'bg-white text-brand-dark ring-black/5 hover:ring-brand'
              }`}
            >
              <span>
                {a.urgent ? '🔴' : '👉'} {a.label}
              </span>
              <span>→</span>
            </Link>
          ))}
        </div>
      )}

      {/* KPI cards. Paid parties = deposit paid and not cancelled, so a party
          stays counted after its date passes and it turns Completed. */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Revenue booked" value={formatCents(stats.revenueBooked)} sub={`${stats.paid} paid parties`} accent />
        <Kpi label="Deposits collected" value={formatCents(stats.depositsCollected)} sub="Cash in the door" />
        <Kpi label="Paid parties" value={String(stats.paid)} sub={`${stats.paidUpcoming} upcoming · ${stats.paidPast} held`} />
        <Kpi label="Conversion" value={`${stats.conversionPct}%`} sub={`of ${stats.startedFamilies} families who started`} />
        <Kpi label="Avg order value" value={formatCents(stats.aov)} sub="Per paid party" />
        <Kpi label="Upsell take-rate" value={`${stats.upsellTakePct}%`} sub={`${formatCents(stats.addOnRevenue)} add-on revenue`} />
        <Kpi
          label="Abandoned"
          value={String(stats.abandonedFamilies)}
          sub={`families who never booked (${stats.abandonedTries} tries)`}
        />
        <Kpi label="New leads" value={String(stats.leadsNew)} sub={<Link href="/admin/leads" className="text-brand hover:underline">View leads →</Link>} />
      </div>
      {stats.testPaid > 0 && (
        <p className="mt-2 text-xs text-foreground/50">
          Staff test bookings are left out of these numbers ({stats.testPaid} paid tests).
        </p>
      )}

      {/* Where families stop, one row per booking step */}
      <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h2 className="font-semibold text-brand-dark">Where families stop</h2>
        <p className="mt-1 text-xs text-foreground/50">
          Each family counted once, at the furthest step they reached. {stats.startedFamilies} families started.
        </p>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-foreground/50">
              <th className="pb-2 font-medium">Step</th>
              <th className="pb-2 text-right font-medium">Got past it</th>
              <th className="pb-2 text-right font-medium">Stopped here</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {stats.steps.map((row, i) => (
              <tr key={row.step}>
                <td className="py-2">
                  <span className="font-medium text-brand-dark">
                    {row.step === 'Paid' ? 'Paid' : `${i + 1}. ${row.step}`}
                  </span>
                  {row.note && <span className="block text-xs text-foreground/50">{row.note}</span>}
                  {row.passed !== null && (
                    <div className="mt-1 h-1.5 rounded-full bg-black/5">
                      <div
                        className={`h-1.5 rounded-full ${row.step === 'Paid' ? 'bg-accent' : 'bg-brand'}`}
                        style={{ width: `${stats.startedFamilies ? Math.round((row.passed / stats.startedFamilies) * 100) : 0}%` }}
                      />
                    </div>
                  )}
                </td>
                <td className="py-2 text-right align-top">{row.passed ?? '—'}</td>
                <td className={`py-2 text-right align-top ${row.stoppedHere ? 'font-semibold' : ''}`}>{row.stoppedHere ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
