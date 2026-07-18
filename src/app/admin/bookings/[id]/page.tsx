import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { minutesToLabel, formatDateLong } from '@/lib/time'
import { StatusBadge } from '../../StatusBadge'
import BookingActions from './BookingActions'

export const dynamic = 'force-dynamic'

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const b = await prisma.booking.findUnique({
    where: { id },
    include: {
      package: true,
      fnbPackage: true,
      addOns: { include: { addOn: true } },
      resources: { include: { resource: true } },
    },
  })
  if (!b) notFound()

  const dateStr = b.date.toISOString().slice(0, 10)
  const scheduled = b.status !== 'DRAFT'

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link href="/admin/bookings" className="text-sm text-brand hover:underline">
          ← Bookings
        </Link>
        <StatusBadge status={b.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">{b.customerName ?? 'Draft booking'}</h1>
          <p className="font-mono text-sm text-foreground/50">{b.reference}</p>
        </div>
        <BookingActions id={b.id} status={b.status} needsReview={b.needsReview} depositPaid={b.depositPaid} />
      </div>

      {b.needsReview && b.status === 'PENDING' && b.depositPaid && (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
          ⚠️ Uses shared bays — deposit captured, awaiting your confirmation. Check Trackman for
          conflicts, then hit <strong>Confirm</strong> to finalize and email the guest.
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Event">
          <Row k="Type" v={b.eventType} />
          {scheduled && <Row k="Date" v={formatDateLong(dateStr)} />}
          {scheduled && <Row k="Time" v={`${minutesToLabel(b.startMinutes)} – ${minutesToLabel(b.endMinutes)}`} />}
          <Row k="Party size" v={`${b.partySize} guests`} />
          <Row k="Bays needed" v={String(b.baysNeeded)} />
          <Row
            k="Bays assigned"
            v={b.resources.length ? b.resources.map((r) => r.resource.name).join(', ') : '—'}
          />
          <Row k="Package" v={b.package?.name ?? '—'} />
          <Row k="Food & drink" v={b.fnbPackage?.name ?? '—'} />
          <Row
            k="Add-ons"
            v={b.addOns.length ? b.addOns.map((a) => `${a.addOn.name}${a.quantity > 1 ? ` ×${a.quantity}` : ''}${a.choices.length ? ` (${a.choices.join(', ')})` : ''}`).join(', ') : '—'}
          />
          {b.notes && <Row k="Notes" v={b.notes} />}
        </Card>

        <Card title="Customer & waiver">
          <Row k="Name" v={b.customerName ?? '—'} />
          <Row k="Email" v={b.customerEmail ?? '—'} />
          <Row k="Phone" v={b.customerPhone ?? '—'} />
          <Row k="Waiver signed" v={b.waiverSigned ? `Yes — ${b.waiverSignedName ?? ''}` : 'No'} />
          <Row k="Guardian (minors)" v={b.waiverGuardian ? 'Yes' : 'No'} />
          {b.waiverSignedAt && <Row k="Signed at" v={b.waiverSignedAt.toISOString().slice(0, 16).replace('T', ' ')} />}
        </Card>

        <Card title="Money">
          <Row k="Package" v={formatCents(b.packageTotal)} />
          <Row k="Food & drink" v={formatCents(b.fnbTotal)} />
          <Row k="Add-ons" v={formatCents(b.addOnsTotal)} />
          <Row k="Service charge" v={formatCents(b.serviceCharge)} />
          <Row k="Tax" v={formatCents(b.taxAmount)} />
          <div className="my-2 border-t border-black/10" />
          <Row k="Total" v={formatCents(b.total)} bold />
          <Row k="Deposit" v={`${formatCents(b.depositAmount)} ${b.depositPaid ? '✓ paid' : '(unpaid)'}`} />
          <Row k="Balance" v={b.balancePaid ? `${formatCents(b.balanceDue)} ✓ paid ahead` : `${formatCents(b.balanceDue)} due at event`} />
        </Card>

        <Card title="Record">
          <Row k="Created" v={b.createdAt.toISOString().slice(0, 16).replace('T', ' ')} />
          <Row k="Updated" v={b.updatedAt.toISOString().slice(0, 16).replace('T', ' ')} />
          {b.paidAt && <Row k="Paid at" v={b.paidAt.toISOString().slice(0, 16).replace('T', ' ')} />}
          {b.stripePaymentIntentId && <Row k="Stripe PI" v={b.stripePaymentIntentId} />}
        </Card>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <h2 className="mb-3 font-semibold text-brand-dark">{title}</h2>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </div>
  )
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-foreground/60">{k}</dt>
      <dd className={`text-right ${bold ? 'font-bold' : 'font-medium'}`}>{v}</dd>
    </div>
  )
}
