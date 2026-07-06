import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import LeadActions from './LeadActions'

export const dynamic = 'force-dynamic'

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lead = await prisma.lead.findUnique({ where: { id } })
  if (!lead) notFound()
  const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } })

  return (
    <div>
      <Link href="/admin/leads" className="text-sm text-brand hover:underline">← Leads</Link>
      <h1 className="mt-2 text-2xl font-bold text-brand-dark">{lead.customerName}</h1>
      <p className="text-sm text-foreground/50">
        {lead.eventType} · received {lead.createdAt.toISOString().slice(0, 10)}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h2 className="mb-3 font-semibold text-brand-dark">Inquiry</h2>
          <dl className="space-y-1.5 text-sm">
            <Row k="Email" v={lead.customerEmail} />
            <Row k="Phone" v={lead.customerPhone ?? '—'} />
            <Row k="Preferred date" v={lead.preferredDate ? lead.preferredDate.toISOString().slice(0, 10) : '—'} />
            <Row k="Flexible" v={lead.dateFlexible ? 'Yes' : 'No'} />
            <Row k="Headcount" v={lead.headcountMin || lead.headcountMax ? `${lead.headcountMin ?? '?'}–${lead.headcountMax ?? '?'}` : '—'} />
            <Row k="Budget" v={lead.budget ?? '—'} />
            <Row k="Must-haves" v={lead.mustHaves.length ? lead.mustHaves.join(', ') : '—'} />
            {lead.message && <Row k="Message" v={lead.message} />}
          </dl>
        </div>

        <LeadActions
          leadId={lead.id}
          status={lead.status}
          depositPercent={setting.depositPercent}
          defaults={{
            partySize: lead.headcountMax ?? lead.headcountMin ?? 20,
            dateStr: lead.preferredDate ? lead.preferredDate.toISOString().slice(0, 10) : '',
          }}
        />
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-foreground/60">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  )
}
