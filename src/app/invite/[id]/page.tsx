import Link from 'next/link'
import { prisma } from '@/lib/db'
import { minutesToLabel, formatDateLong } from '@/lib/time'

export const dynamic = 'force-dynamic'

// Public, shareable invite: the organizer sends this link to their guests.
// Doubles as marketing — every guest sees the venue + a "book your own" CTA.
export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const booking = await prisma.booking.findUnique({ where: { id }, include: { package: true } })

  if (!booking || booking.status !== 'CONFIRMED') {
    return (
      <main className="flex flex-1 items-center justify-center p-10">
        <p className="text-foreground/60">This invite isn&apos;t available.</p>
      </main>
    )
  }

  const dateStr = booking.date.toISOString().slice(0, 10)
  const firstName = (booking.customerName ?? 'Your host').split(' ')[0]

  return (
    <main className="flex-1 bg-brand-dark text-white">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="rounded-full bg-white/10 px-4 py-1 text-sm font-medium text-accent">You&apos;re invited! 🎉</p>
        <h1 className="mt-6 text-4xl font-extrabold leading-tight">
          {firstName}&apos;s event at
          <br />
          <span className="text-accent">Whitetail Ridge Golf Dome</span>
        </h1>

        <div className="mt-8 w-full rounded-2xl bg-white/10 p-6 backdrop-blur">
          <dl className="space-y-2 text-left">
            <div className="flex justify-between"><dt className="text-white/60">Date</dt><dd className="font-semibold">{formatDateLong(dateStr)}</dd></div>
            <div className="flex justify-between"><dt className="text-white/60">Time</dt><dd className="font-semibold">{minutesToLabel(booking.startMinutes)} – {minutesToLabel(booking.endMinutes)}</dd></div>
            <div className="flex justify-between"><dt className="text-white/60">Where</dt><dd className="font-semibold text-right">3360 Station Dr,<br />Oswego, IL 60543</dd></div>
          </dl>
        </div>

        <p className="mt-6 text-sm text-white/70">
          Golf, games, food & a great time — see you there! 🏌️
        </p>

        <div className="mt-10 border-t border-white/10 pt-8">
          <p className="text-sm text-white/60">Want to throw your own party here?</p>
          <Link
            href="/book"
            className="mt-3 inline-block rounded-full bg-accent px-6 py-3 font-bold text-ink transition hover:bg-accent-dark hover:text-ink"
          >
            Book your own event →
          </Link>
        </div>
      </div>
    </main>
  )
}
