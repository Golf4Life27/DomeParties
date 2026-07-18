import Link from 'next/link'
import { prisma } from '@/lib/db'
import { minutesToLabel, formatDateLong, todayStr, addDays } from '@/lib/time'
import { formatCents } from '@/lib/money'
import { calendarFeedKey } from '@/lib/sign'
import { StatusBadge } from '../StatusBadge'

export const dynamic = 'force-dynamic'

// The Trackman-reconciliation view: everything this system has sold for one
// day, with bays, so staff can mirror/verify blocks in Trackman at a glance.
export default async function DayView({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const sp = await searchParams
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : todayStr()
  const date = new Date(`${dateStr}T00:00:00.000Z`)

  const bookings = await prisma.booking.findMany({
    where: {
      date,
      status: { in: ['PENDING', 'CONFIRMED', 'COMPLETED'] },
    },
    include: { resources: { include: { resource: true } }, package: true },
    orderBy: { startMinutes: 'asc' },
  })
  const active = bookings.filter((b) => b.status !== 'PENDING' || b.depositPaid || b.holdExpiresAt)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const feedUrl = `${appUrl}/api/calendar.ics?key=${calendarFeedKey()}`

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-brand-dark">Day view</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/admin/day?date=${addDays(dateStr, -1)}`} className="rounded-full bg-black/5 px-3 py-1.5 hover:bg-black/10">← Prev</Link>
          <span className="font-semibold">{formatDateLong(dateStr)}</span>
          <Link href={`/admin/day?date=${addDays(dateStr, 1)}`} className="rounded-full bg-black/5 px-3 py-1.5 hover:bg-black/10">Next →</Link>
          {dateStr !== todayStr() && (
            <Link href="/admin/day" className="rounded-full bg-black/5 px-3 py-1.5 hover:bg-black/10">Today</Link>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-foreground/60">
        Everything this system has sold for this day — mirror these bays as blocks in Trackman.
      </p>

      {active.length === 0 ? (
        <p className="mt-10 text-center text-foreground/50">No events this day.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {active.map((b) => (
            <Link
              key={b.id}
              href={`/admin/bookings/${b.id}`}
              className="block rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:ring-brand"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-lg font-bold text-brand-dark">
                  {minutesToLabel(b.startMinutes)} – {minutesToLabel(b.endMinutes)}
                </span>
                <StatusBadge status={b.status} />
                {b.needsReview && b.status === 'PENDING' && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                    needs review
                  </span>
                )}
                <span className="ml-auto font-mono text-sm text-foreground/50">{b.reference}</span>
              </div>
              <div className="mt-2 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-foreground/50">Guest:</span>{' '}
                  <strong>{b.customerName ?? '—'}</strong> · {b.partySize} guests
                  {b.customerPhone ? ` · ${b.customerPhone}` : ''}
                </p>
                <p>
                  <span className="text-foreground/50">Bays:</span>{' '}
                  <strong>{b.resources.map((r) => r.resource.name).join(', ') || 'none assigned'}</strong>
                </p>
                <p>
                  <span className="text-foreground/50">Package:</span> {b.package?.name ?? 'Custom quote'}
                </p>
                <p>
                  <span className="text-foreground/50">Money:</span> {formatCents(b.total)} total ·{' '}
                  {b.balancePaid ? (
                    <span className="font-semibold text-green-700">balance paid</span>
                  ) : (
                    <span className="font-semibold text-amber-700">
                      {formatCents(b.balanceDue)} due at event
                    </span>
                  )}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-10 rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-black/5">
        <h2 className="font-semibold text-brand-dark">📅 Subscribe on your phone</h2>
        <p className="mt-1 text-foreground/60">
          Add this feed to Google/Apple Calendar and every event (with its bays) appears on your
          phone automatically — no logging in:
        </p>
        <code className="mt-2 block overflow-x-auto rounded-lg bg-black/5 p-3 text-xs">{feedUrl}</code>
      </div>
    </div>
  )
}
