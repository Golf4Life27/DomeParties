import Link from 'next/link'
import { prisma } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { LEAD_BADGE, LEAD_STATUSES, leadLabel, type LeadStatusValue } from '@/lib/lead-status'

export const dynamic = 'force-dynamic'

export default async function LeadsList() {
  const [leads, byStatus, wonAgg] = await Promise.all([
    prisma.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.lead.aggregate({ where: { status: 'WON' }, _sum: { wonValue: true } }),
  ])
  const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Partial<Record<LeadStatusValue, number>>

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Leads</h1>
      <p className="mt-1 text-foreground/60">Inquiries from the website. Respond fast — speed wins events.</p>

      {/* How quote requests end: one count per status, and the dollars won. */}
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {LEAD_STATUSES.map((st) => (
          <span key={st} className={`rounded-full px-3 py-1 font-medium ${LEAD_BADGE[st]}`}>
            {leadLabel(st)}: {counts[st] ?? 0}
          </span>
        ))}
        <span className="rounded-full bg-green-600 px-3 py-1 font-semibold text-white">
          Won value: {formatCents(wonAgg._sum.wonValue ?? 0)}
        </span>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <table className="w-full text-sm">
          <thead className="border-b border-black/5 text-left text-xs uppercase text-foreground/50">
            <tr>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Headcount</th>
              <th className="px-4 py-3">Budget</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {leads.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-foreground/50">No leads yet.</td></tr>
            )}
            {leads.map((l) => (
              <tr key={l.id} className="hover:bg-brand-light/40">
                <td className="px-4 py-3 text-xs text-foreground/60">{l.createdAt.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/leads/${l.id}`} className="font-medium text-brand hover:underline">
                    {l.customerName}
                  </Link>
                  <span className="block text-xs text-foreground/50">{l.customerEmail}</span>
                </td>
                <td className="px-4 py-3">{l.eventType}</td>
                <td className="px-4 py-3">
                  {l.headcountMin || l.headcountMax ? `${l.headcountMin ?? '?'}–${l.headcountMax ?? '?'}` : '—'}
                </td>
                <td className="px-4 py-3">{l.budget ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${LEAD_BADGE[l.status as LeadStatusValue] ?? 'bg-black/5'}`}>
                    {leadLabel(l.status)}
                  </span>
                  {l.status === 'WON' && l.wonValue ? (
                    <span className="ml-2 text-xs font-medium text-green-700">{formatCents(l.wonValue)}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
