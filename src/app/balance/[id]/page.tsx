import Link from 'next/link'
import { prisma } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { minutesToLabel, formatDateLong } from '@/lib/time'
import PayBalance from './PayBalance'

export const dynamic = 'force-dynamic'

export default async function BalancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const booking = await prisma.booking.findUnique({ where: { id }, include: { package: true } })

  if (!booking || booking.status !== 'CONFIRMED') {
    return (
      <main className="flex flex-1 items-center justify-center p-10">
        <p className="text-foreground/60">We couldn&apos;t find that booking.</p>
      </main>
    )
  }

  const dateStr = booking.date.toISOString().slice(0, 10)
  const settled = booking.balancePaid || booking.balanceDue <= 0

  return (
    <main className="flex-1">
      <header className="bg-brand-dark text-white">
        <div className="mx-auto max-w-2xl px-6 py-4">
          <Link href="/" className="font-bold">Whitetail Ridge Golf Dome</Link>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-6 py-12">
        <h1 className="text-3xl font-bold text-brand-dark">Pay your balance</h1>
        <p className="mt-1 text-foreground/60">
          {booking.reference} · {formatDateLong(dateStr)} · {minutesToLabel(booking.startMinutes)}
        </p>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-foreground/60">Total</dt><dd className="font-medium">{formatCents(booking.total)}</dd></div>
            <div className="flex justify-between text-brand"><dt>Deposit paid</dt><dd className="font-medium">{formatCents(booking.depositAmount)}</dd></div>
            <div className="flex justify-between text-base font-bold"><dt>Balance due</dt><dd>{settled ? '$0.00' : formatCents(booking.balanceDue)}</dd></div>
          </dl>

          <div className="mt-6">
            {settled ? (
              <div className="rounded-lg bg-green-50 p-4 text-center text-sm text-green-800 ring-1 ring-green-200">
                ✓ You&apos;re fully paid — just show up and have a great time!
              </div>
            ) : (
              <PayBalance bookingId={booking.id} />
            )}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-foreground/50">
          Prefer to settle at the venue? No problem — this just lets you skip the line.
        </p>
      </div>
    </main>
  )
}
