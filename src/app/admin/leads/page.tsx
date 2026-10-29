import Link from 'next/link'
import { prisma } from '@/lib/db'
import { LEAD_STATUSES, leadStatusLabel, type LeadStatusValue } from '@/lib/lead-status'

export const dynamic = 'force-dynamic'

const LEAD_BADGE: Record<string, string> = {
  NEW: 'bg-accent/20 text-accent-dark',
  CONTACTED: 'bg-blue-100 text-blue-800',
  NO_RESPONSE: 'bg-orange-100 text-orange-800',
  PROPOSAL_SENT: 'bg-amber-100 text-amber-800',
  WON: 'bg-green-100 text-green-800',
  LOST: 'bg-black/5 text-foreground/50',
}

export default async function LeadsList({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  // ?status= narrows the list, e.g. "no reply" to see who to work again.
  const { status: raw } = await searchParams
  const status = LEAD_STATUSES.includes(raw as LeadStatusValue) ? (raw as LeadStatusValue) : null
  const [leads, counts] = await Promise.all([
    prisma.lead.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Leads</h1>
      <p className="mt-1 text-foreground/60">Inquiries from the website. Respond fast — speed wins events.</p>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link
          href="/admin/leads"
          className={`rounded-full px-3 py-1.5 ring-1 ${status ? 'ring-black/10 hover:ring-brand' : 'bg-brand text-white ring-brand'}`}
        >
          all
        </Link>
        {LEAD_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/leads?status=${s}`}
            className={`rounded-full px-3 py-1.5 ring-1 ${status === s ? 'bg-brand text-white ring-brand' : 'ring-black/10 hover:ring-brand'}`}
          >
            {leadStatusLabel(s)} ({countOf(s)})
          </Link>
        ))}
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
              <tr><td colSpan={6} className="px-4 py-8 text-center text-foreground/50">{status ? 'No leads with this status.' : 'No leads yet.'}</td></tr>
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
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${LEAD_BADGE[l.status] ?? 'bg-black/5'}`}>
                    {leadStatusLabel(l.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
