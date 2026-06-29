import Link from 'next/link'
import { prisma } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { minutesToLabel, formatDateLong } from '@/lib/time'

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { package: true, fnbPackage: true, addOns: { include: { addOn: true } } },
  })

  if (!booking) {
    return (
      <main className="flex flex-1 items-center justify-center p-10">
        <p className="text-foreground/60">We couldn&apos;t find that booking.</p>
      </main>
    )
  }

  const dateStr = booking.date.toISOString().slice(0, 10)
  const confirmed = booking.status === 'CONFIRMED'
  const pendingReview = booking.status === 'PENDING' && booking.depositPaid && booking.needsReview

  return (
    <main className="flex-1">
      <header className="bg-brand-dark text-white">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <Link href="/" className="font-bold">
            Whitetail Ridge Golf Dome
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-12">
        {confirmed ? (
          <div className="text-center">
            <div className="text-5xl">🎉</div>
            <h1 className="mt-4 text-3xl font-extrabold text-brand-dark">You&apos;re booked!</h1>
            <p className="mt-2 text-foreground/70">
              A confirmation is on its way to {booking.customerEmail}. We can&apos;t wait to
              host you.
            </p>
          </div>
        ) : pendingReview ? (
          <div className="text-center">
            <div className="text-5xl">✅</div>
            <h1 className="mt-4 text-3xl font-extrabold text-brand-dark">Deposit received!</h1>
            <p className="mt-2 text-foreground/70">
              Thanks! We&apos;ve got your deposit and are just confirming bay availability. Your
              final confirmation will arrive at {booking.customerEmail} shortly.
            </p>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-5xl">⏳</div>
            <h1 className="mt-4 text-3xl font-extrabold text-brand-dark">Finalizing your booking…</h1>
            <p className="mt-2 text-foreground/70">
              Your payment is processing. This page will show your confirmation shortly —
              refresh in a moment.
            </p>
          </div>
        )}

        <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground/60">Confirmation</span>
            <span className="rounded-full bg-brand-light px-3 py-1 font-mono font-bold text-brand-dark">
              {booking.reference}
            </span>
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            <Row k="Guest" v={booking.customerName ?? '—'} />
            <Row k="Date" v={formatDateLong(dateStr)} />
            <Row k="Time" v={`${minutesToLabel(booking.startMinutes)} – ${minutesToLabel(booking.endMinutes)}`} />
            <Row k="Party size" v={`${booking.partySize} guests`} />
            <Row k="Bays reserved" v={String(booking.baysNeeded)} />
            <Row k="Package" v={booking.package?.name ?? '—'} />
            {booking.fnbPackage && <Row k="Food & drink" v={booking.fnbPackage.name} />}
            {booking.addOns.length > 0 && (
              <Row k="Add-ons" v={booking.addOns.map((a) => a.addOn.name).join(', ')} />
            )}
          </dl>

          <div className="my-4 border-t border-black/10" />
          <dl className="space-y-1.5 text-sm">
            <Row k="Total" v={formatCents(booking.total)} />
            <div className="flex justify-between font-semibold text-brand">
              <dt>Deposit paid</dt>
              <dd>{formatCents(booking.depositAmount)}</dd>
            </div>
            <Row k="Balance due at event" v={formatCents(booking.balanceDue)} />
          </dl>
        </div>

        <div className="mt-6 rounded-2xl bg-brand-light p-6 text-center">
          <h2 className="font-bold text-brand-dark">Make it even better 🎈</h2>
          <p className="mt-1 text-sm text-foreground/70">
            Want to add food, extend your bay time, or invite more guests? Just reply to your
            confirmation email and we&apos;ll take care of it.
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="text-sm font-medium text-brand hover:underline">
            ← Back to home
          </Link>
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
