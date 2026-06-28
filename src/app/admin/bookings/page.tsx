import Link from 'next/link'
import { prisma } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { minutesToLabel } from '@/lib/time'
import { StatusBadge } from '../StatusBadge'
import type { BookingStatus } from '@/generated/prisma'

export const dynamic = 'force-dynamic'

const FILTERS = ['ALL', 'CONFIRMED', 'PENDING', 'DRAFT', 'CANCELLED'] as const

export default async function BookingsList({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const active = (status?.toUpperCase() ?? 'ALL') as (typeof FILTERS)[number]
  const where = active === 'ALL' ? {} : { status: active as BookingStatus }

  const bookings = await prisma.booking.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: { package: true },
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Bookings</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'ALL' ? '/admin/bookings' : `/admin/bookings?status=${f}`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition ${
              active === f ? 'bg-brand text-white ring-brand' : 'bg-white ring-black/10 hover:ring-brand'
            }`}
          >
            {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
          </Link>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <table className="w-full text-sm">
          <thead className="border-b border-black/5 text-left text-xs uppercase text-foreground/50">
            <tr>
              <th className="px-4 py-3">Ref</th>
              <th className="px-4 py-3">Guest</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Party</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {bookings.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-foreground/50">
                  No bookings here yet.
                </td>
              </tr>
            )}
            {bookings.map((b) => (
              <tr key={b.id} className="hover:bg-brand-light/40">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/admin/bookings/${b.id}`} className="text-brand hover:underline">
                    {b.reference}
                  </Link>
                </td>
                <td className="px-4 py-3">{b.customerName ?? '—'}</td>
                <td className="px-4 py-3">
                  {b.status === 'DRAFT' ? '—' : `${b.date.toISOString().slice(0, 10)} ${minutesToLabel(b.startMinutes)}`}
                </td>
                <td className="px-4 py-3">{b.partySize || '—'}</td>
                <td className="px-4 py-3">{b.package?.name ?? '—'}</td>
                <td className="px-4 py-3 text-right font-medium">
                  {b.total ? formatCents(b.total) : '—'}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={b.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
