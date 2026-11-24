import Link from 'next/link'
import { prisma } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { minutesToLabel } from '@/lib/time'
import { StatusBadge } from '../StatusBadge'
import { BOOKING_FILTERS, bookingWhere, parseFilter } from '@/lib/booking-search'

export const dynamic = 'force-dynamic'

const PER_PAGE = 50

export default async function BookingsList({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>
}) {
  const { status, q, page } = await searchParams
  const active = parseFilter(status)
  const term = q?.trim() ?? ''
  const where = bookingWhere(active, term)
  const pageNum = Math.max(1, Number.parseInt(page ?? '1', 10) || 1)

  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { package: true },
    }),
  ])
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))

  // Keep the search and filter when switching filters, pages or exporting.
  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { status: active === 'ALL' ? undefined : active, q: term || undefined, ...over }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    const s = p.toString()
    return s ? `?${s}` : ''
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-dark">Bookings</h1>
        <a
          href={`/api/admin/export/bookings${qs({})}`}
          className="rounded-full bg-white px-4 py-1.5 text-sm font-medium ring-1 ring-black/10 hover:ring-brand"
        >
          Export CSV{term || active !== 'ALL' ? ' (this view)' : ' (all)'}
        </a>
      </div>

      <form action="/admin/bookings" className="mt-4 flex gap-2">
        {active !== 'ALL' && <input type="hidden" name="status" value={active} />}
        <input
          type="search"
          name="q"
          defaultValue={term}
          placeholder="Search name, email, phone or reference"
          className="w-full max-w-md rounded-full bg-white px-4 py-1.5 text-sm ring-1 ring-black/10 focus:outline-none focus:ring-brand"
        />
        <button type="submit" className="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white">
          Search
        </button>
        {term && (
          <Link href={`/admin/bookings${qs({ q: undefined })}`} className="self-center text-sm text-brand hover:underline">
            Clear
          </Link>
        )}
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {BOOKING_FILTERS.map((f) => (
          <Link
            key={f}
            href={`/admin/bookings${qs({ status: f === 'ALL' ? undefined : f, page: undefined })}`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition ${
              active === f ? 'bg-brand text-white ring-brand' : 'bg-white ring-black/10 hover:ring-brand'
            }`}
          >
            {f === 'ALL' ? 'All' : f === 'NEEDS_REVIEW' ? 'Needs review' : f.charAt(0) + f.slice(1).toLowerCase()}
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
                  {term ? `No bookings match “${term}”.` : 'No bookings here yet.'}
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

      <div className="mt-4 flex items-center justify-between text-sm text-foreground/60">
        <span>
          {total === 0 ? 'No bookings' : `${(pageNum - 1) * PER_PAGE + 1}–${Math.min(pageNum * PER_PAGE, total)} of ${total}`}
        </span>
        <span className="flex gap-3">
          {pageNum > 1 && (
            <Link href={`/admin/bookings${qs({ page: String(pageNum - 1) })}`} className="text-brand hover:underline">
              ← Newer
            </Link>
          )}
          {pageNum < pages && (
            <Link href={`/admin/bookings${qs({ page: String(pageNum + 1) })}`} className="text-brand hover:underline">
              Older →
            </Link>
          )}
        </span>
      </div>
    </div>
  )
}
