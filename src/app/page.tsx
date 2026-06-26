import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="bg-brand-dark text-white">
        <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-brand-light">
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
              className="rounded-full bg-accent px-8 py-4 text-lg font-bold text-brand-dark shadow-lg transition hover:bg-accent-dark hover:text-white"
            >
              Book your event →
            </Link>
            <span className="text-sm text-white/70">
              No account needed · Instant confirmation
            </span>
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
            <div key={f.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <div className="text-3xl">{f.icon}</div>
              <h3 className="mt-4 text-lg font-bold text-brand-dark">{f.title}</h3>
              <p className="mt-2 text-sm text-foreground/70">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 rounded-2xl bg-brand-light p-8 text-center">
          <h2 className="text-2xl font-bold text-brand-dark">Planning something bigger?</h2>
          <p className="mx-auto mt-2 max-w-lg text-foreground/70">
            Corporate outings, leagues, and full buyouts get a custom quote. Start a
            booking and we&apos;ll guide you to the right path.
          </p>
          <Link
            href="/book"
            className="mt-6 inline-block rounded-full bg-brand px-6 py-3 font-semibold text-white transition hover:bg-brand-dark"
          >
            Get started
          </Link>
        </div>
      </section>

      <footer className="border-t border-black/5 py-8 text-center text-sm text-foreground/50">
        Whitetail Ridge Golf Dome · Oswego, IL · Questions? Call us or start a booking.
      </footer>
    </main>
  )
}
