import Link from 'next/link'
import { prisma } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { minutesToLabel, formatDateLong } from '@/lib/time'
import PayDeposit from './PayDeposit'

export const dynamic = 'force-dynamic'

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const booking = await prisma.booking.findUnique({ where: { id }, include: { package: true } })

  if (!booking) {
    return (
      <main className="flex flex-1 items-center justify-center p-10">
        <p className="text-foreground/60">We couldn&apos;t find that quote.</p>
      </main>
    )
  }

  const dateStr = booking.date.toISOString().slice(0, 10)
  const paid = booking.status === 'CONFIRMED' || booking.depositPaid

  return (
    <main className="flex-1">
      <header className="bg-brand-dark text-white">
        <div className="mx-auto max-w-2xl px-6 py-4">
          <Link href="/" className="font-bold">Whitetail Ridge Golf Dome</Link>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-6 py-12">
        <h1 className="text-3xl font-bold text-brand-dark">Reserve your event</h1>
        <p className="mt-1 text-foreground/60">Quote {booking.reference}</p>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <dl className="space-y-1.5 text-sm">
            <Row k="Guest" v={booking.customerName ?? '—'} />
            <Row k="Date" v={formatDateLong(dateStr)} />
            <Row k="Time" v={`${minutesToLabel(booking.startMinutes)} – ${minutesToLabel(booking.endMinutes)}`} />
            <Row k="Party size" v={`${booking.partySize} guests`} />
            {booking.notes && <Row k="Note" v={booking.notes} />}
          </dl>
          <div className="my-4 border-t border-black/10" />
          <div className="flex justify-between text-base font-bold">
            <span>Total</span>
            <span>{formatCents(booking.total)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm text-brand">
            <span>Deposit to reserve</span>
            <span className="font-bold">{formatCents(booking.depositAmount)}</span>
          </div>
          <div className="flex justify-between text-xs text-foreground/50">
            <span>Balance at event</span>
            <span>{formatCents(booking.balanceDue)}</span>
          </div>

          <div className="mt-6">
            {paid ? (
              <div className="rounded-lg bg-green-50 p-4 text-center text-sm text-green-800 ring-1 ring-green-200">
                ✓ Deposit received — your date is locked in! A confirmation is on its way.
              </div>
            ) : (
              <PayDeposit bookingId={booking.id} />
            )}
          </div>
        </div>
      </div>
    </main>
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
