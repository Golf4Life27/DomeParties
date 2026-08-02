import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { VENUE } from '@/lib/venue'
import { formatCents } from '@/lib/money'
import { minutesToLabel, todayStr, addDays } from '@/lib/time'
import { staffCalendarKey, keyMatches } from '@/lib/sign'
import { sweepConflicts, type ConflictWindow } from '@/lib/trackman'

export const dynamic = 'force-dynamic'

// Shared, read-only calendar for the whole team. Reached by signed link rather
// than a login so it works on any phone on the floor — so it must never be
// indexed, and it must never expose an action.
export const metadata: Metadata = {
  title: 'Staff Calendar — Whitetail Ridge Golf Dome',
  robots: { index: false, follow: false, nocache: true },
}

const DEFAULT_DAYS = 14
const REFRESH_SECONDS = 60

function dateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function dayHeading(dateStr: string): { weekday: string; rest: string; isToday: boolean } {
  const d = dateOnly(dateStr)
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  const rest = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
  return { weekday, rest, isToday: dateStr === todayStr() }
}

export default async function StaffCalendar({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const provided = typeof sp.key === 'string' ? sp.key : undefined

  if (!keyMatches(provided, staffCalendarKey())) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
        <h1 className="text-2xl font-bold text-brand">Staff calendar</h1>
        <p className="mt-3 text-foreground/70">
          This calendar is only reachable from its shared link. Ask Alex for the current one.
        </p>
      </main>
    )
  }

  const from = typeof sp.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : todayStr()
  const days = Math.min(Math.max(Number(sp.days) || DEFAULT_DAYS, 1), 60)
  const to = addDays(from, days - 1)

  const [bookings, external, bayCount] = await Promise.all([
    prisma.booking.findMany({
      where: {
        date: { gte: dateOnly(from), lte: dateOnly(to) },
        status: { in: ['CONFIRMED', 'PENDING'] },
      },
      include: { resources: { include: { resource: true } }, package: true, fnbPackage: true },
      orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }],
    }),
    prisma.externalReservation.findMany({
      where: { date: { gte: dateOnly(from), lte: dateOnly(to) } },
      select: { date: true, startMinutes: true, endMinutes: true, bayCount: true, label: true },
    }),
    prisma.resource.count({ where: { type: 'BAY', active: true } }),
  ])

  const dayKey = (d: Date) => d.toISOString().slice(0, 10)

  // One sweep per day, over rows already in memory — same rule the Trackman
  // conflict cron uses, so the calendar can't disagree with the alerts.
  const conflictsByDay = new Map<string, ConflictWindow[]>()
  for (let i = 0; i < days; i++) {
    const ds = addDays(from, i)
    const ours = bookings
      .filter((b) => dayKey(b.date) === ds && (b.status === 'CONFIRMED' || b.depositPaid))
      .map((b) => ({
        reference: b.reference,
        startMinutes: b.startMinutes,
        endMinutes: b.endMinutes,
        baysNeeded: b.baysNeeded,
      }))
    const ext = external.filter((e) => dayKey(e.date) === ds)
    const windows = sweepConflicts(ours, ext, bayCount)
    if (windows.length) conflictsByDay.set(ds, windows)
  }

  const dayList = Array.from({ length: days }, (_, i) => addDays(from, i))
  const totalEvents = bookings.length
  const conflictDays = conflictsByDay.size

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
      {/* Auto-refresh so a screen left open on the counter stays current. */}
      <meta httpEquiv="refresh" content={String(REFRESH_SECONDS)} />

      <header className="border-b border-white/10 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground/50">
          {VENUE.name}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-brand sm:text-3xl">Staff calendar</h1>
        <p className="mt-2 text-sm text-foreground/70">
          {totalEvents} {totalEvents === 1 ? 'event' : 'events'} across the next {days} days ·
          refreshes every {REFRESH_SECONDS}s · read-only
        </p>
      </header>

      {conflictDays > 0 && (
        <section className="mt-5 rounded-xl border border-red-400/40 bg-red-500/10 p-4">
          <h2 className="text-sm font-bold text-red-300">
            ⚠ Over capacity on {conflictDays} {conflictDays === 1 ? 'day' : 'days'}
          </h2>
          <p className="mt-1 text-sm text-foreground/75">
            More bays are committed than the dome has ({bayCount}). Check these against Trackman
            before anyone else books.
          </p>
        </section>
      )}

      <div className="mt-6 flex flex-col gap-8">
        {dayList.map((ds) => {
          const dayBookings = bookings.filter((b) => dayKey(b.date) === ds)
          const windows = conflictsByDay.get(ds) ?? []
          const { weekday, rest, isToday } = dayHeading(ds)
          const extToday = external.filter((e) => dayKey(e.date) === ds)

          return (
            <section key={ds}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-white/10 pb-2">
                <h2 className="text-lg font-bold text-brand">{weekday}</h2>
                <span className="text-sm text-foreground/60">{rest}</span>
                {isToday && (
                  <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
                    Today
                  </span>
                )}
                <span className="ml-auto text-xs text-foreground/50">
                  {dayBookings.length === 0
                    ? 'nothing booked'
                    : `${dayBookings.length} ${dayBookings.length === 1 ? 'event' : 'events'}`}
                </span>
              </div>

              {windows.map((w, i) => (
                <p
                  key={i}
                  className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
                >
                  ⚠ {minutesToLabel(w.startMinutes)}–{minutesToLabel(w.endMinutes)}: {w.demand} bays
                  needed, {w.capacity} exist
                  {w.ourBookings.length > 0 && (
                    <> · ours: {w.ourBookings.map((b) => `${b.reference} (${b.bays})`).join(', ')}</>
                  )}
                </p>
              ))}

              {dayBookings.length > 0 && (
                <ul className="mt-3 flex flex-col gap-3">
                  {dayBookings.map((b) => {
                    const bays = b.resources.map((r) => r.resource.name)
                    const unpaidHold = b.status === 'PENDING' && !b.depositPaid
                    return (
                      <li
                        key={b.id}
                        className={`rounded-xl p-4 ring-1 ${
                          unpaidHold
                            ? 'bg-surface/40 ring-white/5 opacity-70'
                            : 'bg-surface ring-white/10'
                        }`}
                      >
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="font-bold tabular-nums text-accent">
                            {minutesToLabel(b.startMinutes)}–{minutesToLabel(b.endMinutes)}
                          </span>
                          <span className="font-semibold">{b.customerName ?? 'Guest'}</span>
                          <span className="text-sm text-foreground/60">
                            {b.partySize} golfer{b.partySize === 1 ? '' : 's'}
                            {b.fnbGuests > 0 && ` + ${b.fnbGuests} F&B`}
                          </span>
                          <span className="ml-auto font-mono text-xs text-foreground/45">
                            {b.reference}
                          </span>
                        </div>

                        <p className="mt-1.5 text-sm text-foreground/70">
                          {bays.length ? bays.join(', ') : `${b.baysNeeded} bays — not yet assigned`}
                          {b.package && <> · {b.package.name}</>}
                          {b.fnbPackage && <> · {b.fnbPackage.name}</>}
                        </p>

                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                          {b.status === 'CONFIRMED' && !b.needsReview && (
                            <Chip tone="good">Confirmed</Chip>
                          )}
                          {b.needsReview && <Chip tone="warn">Needs review</Chip>}
                          {unpaidHold && <Chip tone="muted">Hold — deposit unpaid</Chip>}
                          {b.depositPaid && !b.balancePaid && (
                            <Chip tone="muted">Balance {formatCents(b.balanceDue)}</Chip>
                          )}
                          {b.balancePaid && <Chip tone="good">Paid in full</Chip>}
                          {b.customerPhone && (
                            <a
                              href={`tel:${b.customerPhone}`}
                              className="ml-auto font-semibold text-brand underline-offset-2 hover:underline"
                            >
                              {b.customerPhone}
                            </a>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}

              {extToday.length > 0 && (
                <p className="mt-3 text-xs text-foreground/50">
                  Trackman that day:{' '}
                  {extToday
                    .map(
                      (e) =>
                        `${minutesToLabel(e.startMinutes)}–${minutesToLabel(e.endMinutes)} ×${e.bayCount}`,
                    )
                    .join(' · ')}
                </p>
              )}
            </section>
          )
        })}
      </div>

      <footer className="mt-12 border-t border-white/10 pt-5 text-center text-xs text-foreground/45">
        Read-only. Confirmed and held bookings only — cancelled and unfinished carts are hidden.
        <br />
        Anyone with this link can see it, so keep it to the team.
      </footer>
    </main>
  )
}

function Chip({ tone, children }: { tone: 'good' | 'warn' | 'muted'; children: React.ReactNode }) {
  const styles = {
    good: 'bg-accent/15 text-accent',
    warn: 'bg-red-500/15 text-red-300',
    muted: 'bg-white/8 text-foreground/70',
  }[tone]
  return <span className={`rounded-full px-2 py-0.5 font-semibold ${styles}`}>{children}</span>
}
