import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { prisma } from '@/lib/db'
import { VENUE } from '@/lib/venue'

// Ad landing page for birthday / celebration traffic. Exists so paid clicks land
// on one message ("book the party in minutes") instead of the homepage's
// everything-page, and so ad platforms have a clean URL to attribute against.
// The attribution cookie is set by the root layout; this page just converts.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Birthday Parties at Whitetail Ridge Golf Dome — Book in Minutes',
  description:
    'Indoor golf birthday parties in Oswego, IL. Private Trackman bays, party host included, food & drinks. Pick a date and lock it in with a 10% deposit.',
}

export default async function PartyLanding() {
  // Live floor price so the page can say "from $X" without hardcoding a number
  // that drifts when rates change in the admin.
  // Most birthday packages price from the BayRate table (flatPrice = 0), so only
  // a real flat price can honestly back a "from $X" claim; otherwise say nothing.
  const cheapest = await prisma.package
    .findFirst({
      where: { active: true, eventType: 'BIRTHDAY', flatPrice: { gt: 0 } },
      orderBy: { flatPrice: 'asc' },
      select: { flatPrice: true },
    })
    .catch(() => null)
  const fromPrice = cheapest?.flatPrice ? `$${Math.round(cheapest.flatPrice / 100)}` : null

  return (
    <main className="flex-1">
      <section className="relative overflow-hidden bg-brand-dark text-white">
        <Image
          src="/images/hero-dome.jpg"
          alt="Birthday party in the hitting bays at Whitetail Ridge Golf Dome"
          fill
          priority
          className="object-cover object-center opacity-45"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/80 via-brand-dark/60 to-brand-dark" />
        <div className="relative mx-auto max-w-3xl px-6 py-16 text-center sm:py-24">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-brand backdrop-blur">
            🎂 Birthday parties · Oswego, IL
          </p>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight sm:text-5xl">
            The birthday party <span className="text-accent">you don&apos;t have to run.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/85">
            Private golf bays, a dedicated party host who runs the games, food and drinks
            served to your bay — and nobody needs to know how to golf.
            {fromPrice ? ` Parties from ${fromPrice}.` : ''}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/book"
              className="rounded-full bg-accent px-8 py-4 text-lg font-bold text-ink shadow-lg transition hover:bg-accent-dark hover:text-ink"
            >
              See dates &amp; prices →
            </Link>
          </div>
          <p className="mt-4 text-sm text-white/70">
            ✓ 10% deposit locks your date · ✓ No account needed · ✓ Takes about 3 minutes
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            ['🏌️', 'Everything included', 'Clubs, unlimited balls, Trackman games and virtual courses — first-timers and kids have just as much fun as golfers.'],
            ['🎉', 'A host runs the party', 'Your dedicated party host demos the games and keeps the group going while a server handles food and drinks.'],
            ['🍕', 'Food they actually eat', 'Kid-friendly meals from $7 a guest, buffets, platters, and a full bar and restaurant for the grown-ups.'],
          ].map(([icon, title, body]) => (
            <div key={title} className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-white/10">
              <div className="text-3xl">{icon}</div>
              <h2 className="mt-3 font-bold text-brand">{title}</h2>
              <p className="mt-2 text-sm text-foreground/70">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-surface p-8 text-center shadow-sm ring-1 ring-white/10">
          <h2 className="text-2xl font-bold text-brand">Weekends book out first</h2>
          <p className="mx-auto mt-2 max-w-md text-foreground/70">
            Pick your date, see the real price before you pay anything, and lock it in
            with just a 10% deposit.
          </p>
          <Link
            href="/book"
            className="mt-6 inline-block rounded-full bg-accent px-8 py-4 text-lg font-bold text-ink shadow transition hover:bg-accent-dark"
          >
            Book your party →
          </Link>
          <p className="mt-4 text-sm text-foreground/50">
            Questions? Call us at <a href={`tel:${VENUE.phoneDigits}`} className="font-semibold text-brand hover:underline">{VENUE.phone}</a> · {VENUE.address}
          </p>
        </div>
      </section>
    </main>
  )
}
