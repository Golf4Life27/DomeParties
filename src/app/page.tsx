import Link from 'next/link'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const partiesThisMonth = await prisma.booking
    .count({ where: { status: 'CONFIRMED', createdAt: { gte: monthStart } } })
    .catch(() => 0)

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="bg-brand-dark text-white">
        <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-brand">
            🏌️ Oswego, IL
          </p>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight sm:text-6xl">
            Throw the party
            <br />
            <span className="text-accent">they&apos;ll never forget.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/80">
            Birthdays, group hangouts, and celebrations at Whitetail Ridge Golf Dome.
            Pick a date, choose a package, and lock it in with a deposit — all in a
            few minutes, right from your phone.
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
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/75">
            <span>✓ No account needed</span>
            <span>✓ Instant confirmation</span>
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

      {/* Social proof */}
      <section className="bg-brand-light/60">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-center text-2xl font-bold text-brand">Loved by party planners 🌟</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              { q: 'Booked my son’s birthday in five minutes from my phone. The kids had a blast!', a: 'Sarah M.' },
              { q: 'Our company outing was seamless — food, bays, and drinks all sorted up front.', a: 'Dave R.' },
              { q: 'The easiest event booking I’ve ever done. Loved picking add-ons as we went.', a: 'Priya K.' },
            ].map((r) => (
              <figure key={r.a} className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-white/10">
                <div className="text-accent">★★★★★</div>
                <blockquote className="mt-3 text-sm text-foreground/80">“{r.q}”</blockquote>
                <figcaption className="mt-3 text-xs font-medium text-foreground/50">— {r.a}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-sm text-foreground/50">
        Whitetail Ridge Golf Dome · Oswego, IL · Questions? Call us or start a booking.
      </footer>
    </main>
  )
}
