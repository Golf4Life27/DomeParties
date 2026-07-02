import Link from 'next/link'
import { prisma } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { minutesToLabel, formatDateLong } from '@/lib/time'
import UpsellList from './UpsellList'
import InviteLink from './InviteLink'

export const dynamic = 'force-dynamic'

export default async function ManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { package: true, fnbPackage: true, addOns: { include: { addOn: true } } },
  })

  if (!booking || booking.status !== 'CONFIRMED') {
    return (
      <main className="flex flex-1 items-center justify-center p-10">
        <p className="text-foreground/60">We couldn&apos;t find that booking.</p>
      </main>
    )
  }

  // Post-booking upsells: active FLAT/PER_PERSON add-ons (time changes need a call).
  const addOns = await prisma.addOn.findMany({
    where: { active: true, unit: { not: 'PER_30_MIN' } },
    orderBy: { sortOrder: 'asc' },
  })

  const dateStr = booking.date.toISOString().slice(0, 10)
  const onBooking = new Map(booking.addOns.map((a) => [a.addOnId, a.quantity]))

  return (
    <main className="flex-1">
      <header className="bg-brand-dark text-white">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <Link href="/" className="font-bold">Whitetail Ridge Golf Dome</Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-3xl font-bold text-brand-dark">Your event 🎉</h1>
        <p className="mt-1 text-foreground/60">
          {booking.reference} · {formatDateLong(dateStr)} · {minutesToLabel(booking.startMinutes)}–{minutesToLabel(booking.endMinutes)} · {booking.partySize} guests
        </p>

        {/* Invite your guests */}
        <div className="mt-6 rounded-2xl bg-brand-light p-6">
          <h2 className="font-bold text-brand-dark">Invite your guests 🎈</h2>
          <p className="mt-1 text-sm text-foreground/70">
            Share one link — it has the date, time, and directions.
          </p>
          <InviteLink bookingId={booking.id} />
        </div>

        {/* Balance */}
        <div className="mt-6 flex items-center justify-between rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div>
            <h2 className="font-bold text-brand-dark">Balance</h2>
            <p className="text-sm text-foreground/60">
              {booking.balancePaid || booking.balanceDue <= 0
                ? 'Fully paid — you’re all set!'
                : `${formatCents(booking.balanceDue)} due at your event`}
            </p>
          </div>
          {!booking.balancePaid && booking.balanceDue > 0 && (
            <Link
              href={`/balance/${booking.id}`}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand-dark transition hover:bg-accent-dark hover:text-white"
            >
              Pay ahead →
            </Link>
          )}
        </div>

        {/* Upsells */}
        <div className="mt-6">
          <h2 className="text-xl font-bold text-brand-dark">Make it unforgettable</h2>
          <p className="mt-1 text-sm text-foreground/60">
            Add extras now — they&apos;re added to your balance, nothing to pay today.
          </p>
          <UpsellList
            bookingId={booking.id}
            partySize={booking.partySize}
            addOns={addOns.map((a) => ({
              id: a.id,
              name: a.name,
              description: a.description,
              category: a.category,
              price: a.price,
              unit: a.unit,
              already: onBooking.get(a.id) ?? 0,
            }))}
          />
        </div>

        <p className="mt-8 text-center text-xs text-foreground/50">
          Need to change your date or party size? Just reply to your confirmation email or call us.
        </p>
      </div>
    </main>
  )
}
