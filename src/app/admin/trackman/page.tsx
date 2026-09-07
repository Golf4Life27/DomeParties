import TrackmanImport from './TrackmanImport'
import { prisma } from '@/lib/db'
import { formatDateLong } from '@/lib/time'

export const dynamic = 'force-dynamic'

function ago(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) === 1 ? '' : 's'} ago`
}

export default async function TrackmanPage() {
  const [openConflicts, syncs] = await Promise.all([
    prisma.conflictAlert.count({ where: { resolvedAt: null } }).catch(() => 0),
    prisma.externalSync
      .findMany({
        where: { date: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
        orderBy: { date: 'asc' },
        take: 30,
      })
      .catch(() => []),
  ])
  const failing = syncs.filter((s) => !s.ok)

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Trackman bay check</h1>
      <p className="mt-1 max-w-2xl text-foreground/60">
        This system and Trackman sell the same 30 bays. We now read Trackman&apos;s bookings
        directly, so a time it has already sold is never offered here, and a checkout is
        re-checked against it before any deposit is taken. Occupancy refreshes on every
        availability lookup and again hourly.
      </p>

      {openConflicts > 0 && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-800 ring-1 ring-red-200">
          🔴 {openConflicts} open conflict{openConflicts === 1 ? '' : 's'} flagged across upcoming
          dates — check the affected days.
        </p>
      )}

      {failing.length > 0 && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
          ⚠️ Couldn&apos;t reach Trackman for {failing.length} upcoming date
          {failing.length === 1 ? '' : 's'}. Bookings on those days are being routed to review
          rather than confirming themselves — that is the safe behaviour, but check Trackman by
          hand before promising anyone a bay.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-brand-dark">Occupancy we&apos;ve read</h2>
        <p className="mt-1 text-sm text-foreground/60">
          Only dates with an event of ours are tracked here — a day with no party of ours
          can&apos;t be double-booked, because every bay Trackman sells is one it already owns.
        </p>
        {syncs.length === 0 ? (
          <p className="mt-3 text-sm text-foreground/50">
            Nothing synced yet. This fills in once there are upcoming bookings.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-foreground/50">
                <tr>
                  <th className="py-2 pr-6 font-medium">Date</th>
                  <th className="py-2 pr-6 font-medium">Trackman bookings</th>
                  <th className="py-2 pr-6 font-medium">Last read</th>
                </tr>
              </thead>
              <tbody>
                {syncs.map((s) => (
                  <tr key={s.id} className="border-t border-foreground/10">
                    <td className="py-2 pr-6">{formatDateLong(s.date.toISOString().slice(0, 10))}</td>
                    <td className="py-2 pr-6">{s.ok ? s.rowCount : '—'}</td>
                    <td className="py-2 pr-6 text-foreground/60">
                      {s.ok ? ago(s.syncedAt) : <span className="text-amber-700">failed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-brand-dark">Manual paste</h2>
        <p className="mt-1 max-w-2xl text-sm text-foreground/60">
          Still here as a fallback. Use it if Trackman is unreachable above and you need a
          specific day checked before finalizing a big event.
        </p>
        <TrackmanImport />
      </section>
    </div>
  )
}
