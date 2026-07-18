import Link from 'next/link'
import Image from 'next/image'
import { prisma } from '@/lib/db'
import { VENUE } from '@/lib/venue'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const partiesThisMonth = await prisma.booking
    .count({ where: { status: 'CONFIRMED', createdAt: { gte: monthStart } } })
    .catch(() => 0)

  return (
    <main className="flex-1">
      {/* Hero — real photo of the dome with a navy wash so the neon copy pops */}
      <section className="relative overflow-hidden bg-brand-dark text-white">
        <Image
          src="/images/hero-dome.jpg"
          alt="Inside Whitetail Ridge Golf Dome — hitting bays, TVs, and the driving range under the dome"
          fill
          priority
          className="object-cover object-center opacity-45"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/80 via-brand-dark/60 to-brand-dark" />
        <div className="relative mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <Image
            src="/images/logo.png"
            alt="Whitetail Ridge Golf Dome"
            width={280}
            height={100}
            className="h-auto w-56 brightness-0 invert sm:w-72"
            priority
          />
          <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-brand backdrop-blur">
            🏌️ Oswego, IL · Play Games, Eat &amp; Drink, Have a Blast!
          </p>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight sm:text-6xl">
            Throw the party
            <br />
            <span className="text-accent">they&apos;ll never forget.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/85">
            Birthdays, group hangouts, and celebrations under the dome. Pick a date,
            choose a package, and lock it in with a deposit — all in a few minutes,
            right from your phone.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/book"
              className="rounded-full bg-accent px-8 py-4 text-lg font-bold text-ink shadow-lg transition hover:bg-accent-dark hover:text-ink"
            >
              Book your event →
            </Link>
            <Link href="/gift" className="text-sm font-medium text-white/90 underline-offset-4 hover:underline">
              🎁 Buy a gift card
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/80">
            <span>✓ No account needed</span>
            <span>✓ 10% deposit locks your date</span>
            {partiesThisMonth >= 3 && (
              <span className="rounded-full bg-accent/20 px-3 py-1 font-medium text-accent">
                🎉 {partiesThisMonth} parties booked this month
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            {
              icon: '⚡',
              title: 'Book in minutes',
              body: 'Date, package, food, done. No phone tag, no waiting on a quote.',
            },
            {
              icon: '💳',
              title: 'Just a 10% deposit',
              body: 'Lock your date now, pay the rest at your event. Cards securely handled by Stripe.',
            },
            {
              icon: '🎉',
              title: 'Built for a great time',
              body: '30 bays, food & drink packages, and add-ons to make it yours.',
            },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-white/10">
              <div className="text-3xl">{f.icon}</div>
              <h3 className="mt-4 text-lg font-bold text-brand">{f.title}</h3>
              <p className="mt-2 text-sm text-foreground/70">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Real photos — what a party at the Dome looks like */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <h2 className="text-center text-2xl font-bold text-brand">Your party, under the dome</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {[
            {
              src: '/images/swing.jpg',
              alt: 'Kid mid-swing on a hitting mat inside the dome',
              title: 'Birthdays they’ll brag about',
              body: 'Private bays, unlimited balls, complimentary clubs, and a party host who runs the show.',
            },
            {
              src: '/images/food.jpg',
              alt: 'Party platters, chips and queso, quesadillas, and drinks',
              title: 'Food & drink, handled',
              body: 'Themed buffets, party platters, and beverage packages served right to your bays.',
            },
            {
              src: '/images/trackman.jpg',
              alt: 'Trackman screens lined up at every bay',
              title: 'Trackman at every bay',
              body: 'Virtual courses, closest-to-the-pin games, and tournaments — fun for golfers and first-timers.',
            },
          ].map((c) => (
            <figure key={c.title} className="overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-white/10">
              <div className="relative aspect-[4/3]">
                <Image src={c.src} alt={c.alt} fill className="object-cover" sizes="(min-width: 640px) 33vw, 100vw" />
              </div>
              <figcaption className="p-5">
                <h3 className="font-bold text-brand">{c.title}</h3>
                <p className="mt-1.5 text-sm text-foreground/70">{c.body}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-14 rounded-2xl bg-brand-light p-8 text-center">
          <h2 className="text-2xl font-bold text-brand">Planning something bigger?</h2>
          <p className="mx-auto mt-2 max-w-lg text-foreground/70">
            Corporate outings, leagues, and full buyouts get a custom quote and a dedicated
            planner — we reply fast.
          </p>
          <Link
            href="/inquire"
            className="mt-6 inline-block rounded-full bg-brand px-6 py-3 font-semibold text-ink transition hover:bg-accent-dark"
          >
            Request a quote
          </Link>
        </div>
      </section>

      {/* Every party includes — straight off the party card */}
      <section className="bg-brand-light/60">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-center text-2xl font-bold text-brand">Every party includes</h2>
          <div className="mx-auto mt-8 grid max-w-3xl gap-x-10 gap-y-3 text-sm text-foreground/85 sm:grid-cols-2">
            {[
              'Private bays with Trackman range technology',
              'Dedicated party host & game demonstration',
              'Personal server for food & drinks',
              'Complimentary clubs & unlimited balls',
              'Virtual courses, games & TV entertainment',
              'Two to four hour reservations',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <span className="mt-0.5 text-accent">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-10 text-center text-sm text-foreground/60">
        <Image
          src="/images/logo.png"
          alt=""
          width={160}
          height={57}
          className="mx-auto mb-4 h-auto w-36 opacity-70 brightness-0 invert"
        />
        <p>
          <a href={VENUE.mapsUrl} target="_blank" rel="noopener" className="hover:text-brand hover:underline">
            {VENUE.address}
          </a>
        </p>
        <p className="mt-1">
          <a href={`tel:${VENUE.phoneDigits}`} className="font-semibold text-brand hover:underline">
            {VENUE.phone}
          </a>
          {' · '}
          <a href={VENUE.website} target="_blank" rel="noopener" className="hover:text-brand hover:underline">
            whitetailridgegolfdome.com
          </a>
          {' · '}
          <a href={VENUE.facebook} target="_blank" rel="noopener" className="hover:text-brand hover:underline">
            Facebook
          </a>
        </p>
      </footer>
    </main>
  )
}
