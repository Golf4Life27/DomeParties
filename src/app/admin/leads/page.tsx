import Link from 'next/link'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const LEAD_BADGE: Record<string, string> = {
  NEW: 'bg-accent/20 text-accent-dark',
  CONTACTED: 'bg-blue-100 text-blue-800',
  PROPOSAL_SENT: 'bg-amber-100 text-amber-800',
  WON: 'bg-green-100 text-green-800',
  LOST: 'bg-black/5 text-foreground/50',
}

export default async function LeadsList() {
  const leads = await prisma.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Leads</h1>
      <p className="mt-1 text-foreground/60">Inquiries from the website. Respond fast — speed wins events.</p>

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
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${LEAD_BADGE[l.status] ?? 'bg-black/5'}`}>
                    {l.status.replace('_', ' ').toLowerCase()}
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
