import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { VENUE } from '@/lib/venue'

// Ad landing page for corporate holiday-party traffic. Corporate groups convert
// by quote, not instant book, so the CTA is the inquiry form (prefilled to
// CORPORATE) plus the phone number — not /book. The attribution cookie set by
// the root layout ties any lead from here back to the ad that bought the click.

export const metadata: Metadata = {
  title: 'Company Holiday Parties at Whitetail Ridge Golf Dome — Oswego, IL',
  description:
    'Book your company holiday party under the dome: 30 heated Trackman bays, full bar & restaurant, up to 120 golfers plus 80 more for food & drinks. Custom quotes within one business day.',
}

export default function HolidayLanding() {
  return (
    <main className="flex-1">
      <section className="relative overflow-hidden bg-brand-dark text-white">
        <Image
          src="/images/hero-dome.jpg"
          alt="Corporate event in the hitting bays at Whitetail Ridge Golf Dome"
          fill
          priority
          className="object-cover object-center opacity-45"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/80 via-brand-dark/60 to-brand-dark" />
        <div className="relative mx-auto max-w-3xl px-6 py-16 text-center sm:py-24">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-brand backdrop-blur">
            🎄 Company holiday parties · Oswego, IL
          </p>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight sm:text-5xl">
            The holiday party <span className="text-accent">nobody skips.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/85">
            Heated golf bays under the dome, games anyone can play, food and a full bar —
            for teams of 10 to 200. Tell us your headcount and we&apos;ll send a custom
            quote, usually within one business day.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/inquire?eventType=CORPORATE"
              className="rounded-full bg-accent px-8 py-4 text-lg font-bold text-ink shadow-lg transition hover:bg-accent-dark hover:text-ink"
            >
              Get my quote →
            </Link>
            <a
              href={`tel:${VENUE.phoneDigits}`}
              className="text-sm font-medium text-white/90 underline-offset-4 hover:underline"
            >
              or call {VENUE.phone}
            </a>
          </div>
          <p className="mt-4 text-sm text-white/70">
            ✓ Takes a minute · ✓ No commitment · ✓ December dates go to whoever books first
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            ['🏢', 'Built for groups', '30 heated Trackman bays hold up to 120 golfers, plus room for 80 more food-and-drink guests. Take over a section — or the building.'],
            ['🕹️', 'No golfers required', 'Virtual courses, closest-to-the-pin and party games with clubs and unlimited balls included. The non-golfers usually have the most fun.'],
            ['🍸', 'Food & bar handled', 'Buffets, platters, and beverage packages from soft drinks to a hosted premium bar — served to your bays by your own server.'],
          ].map(([icon, title, body]) => (
            <div key={title} className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-white/10">
              <div className="text-3xl">{icon}</div>
              <h2 className="mt-3 font-bold text-brand">{title}</h2>
              <p className="mt-2 text-sm text-foreground/70">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-surface p-8 text-center shadow-sm ring-1 ring-white/10">
          <h2 className="text-2xl font-bold text-brand">December fills up by October</h2>
          <p className="mx-auto mt-2 max-w-md text-foreground/70">
            From October 1 we&apos;re open seven days a week, 9am–10pm — but the best
            holiday dates go to the companies that plan early. Send us your rough
            headcount and dates; we&apos;ll build the event around your budget.
          </p>
          <Link
            href="/inquire?eventType=CORPORATE"
            className="mt-6 inline-block rounded-full bg-accent px-8 py-4 text-lg font-bold text-ink shadow transition hover:bg-accent-dark"
          >
            Start my quote →
          </Link>
          <p className="mt-4 text-sm text-foreground/50">
            Prefer to talk? <a href={`tel:${VENUE.phoneDigits}`} className="font-semibold text-brand hover:underline">{VENUE.phone}</a> · {VENUE.address}
          </p>
        </div>
      </section>
    </main>
  )
}
