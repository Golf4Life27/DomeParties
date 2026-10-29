import type { Metadata } from 'next'
import Image from 'next/image'
import { VENUE } from '@/lib/venue'
import TrackedLink from './TrackedLink'

// Ad landing page for everyday golf (not parties). Bay bookings live in
// TrackMan and memberships with the dome team, so every CTA here links out; the
// attribution cookie from the root layout still pins the ad, and TrackedLink
// records which button sent the visitor on. League and membership details come
// from the dome's own 2026–27 flyers. No bay prices or gift cards here until the
// price and the gift card link are confirmed.

export const metadata: Metadata = {
  title: 'Play Golf All Winter at Whitetail Ridge Golf Dome — Oswego, IL',
  description:
    'Heated TrackMan bays open seven days a week from November 2. Join the Tuesday night league, get a winter membership, or just book a bay.',
}

const LEAGUE_EMAIL = 'wtrleagueinfo@gmail.com'
const MEMBERSHIP_EMAIL = 'gerry@whitetailridgegc.com'

const leagueMail = `mailto:${LEAGUE_EMAIL}?subject=${encodeURIComponent('Tuesday league sign-up')}`
const membershipMail = `mailto:${MEMBERSHIP_EMAIL}?subject=${encodeURIComponent('Winter membership')}`

export default function PlayLanding() {
  return (
    <main className="flex-1">
      <section className="relative overflow-hidden bg-brand-dark text-white">
        <Image
          src="/images/bays.jpg"
          alt="Golfers in the heated hitting bays at Whitetail Ridge Golf Dome"
          fill
          priority
          className="object-cover object-center opacity-45"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/80 via-brand-dark/60 to-brand-dark" />
        <div className="relative mx-auto max-w-3xl px-6 py-16 text-center sm:py-24">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-brand backdrop-blur">
            ⛳ Open 7 days a week from November 2 · Oswego, IL
          </p>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight sm:text-5xl">
            Your course closed. <span className="text-accent">Ours didn&apos;t.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/85">
            Heated TrackMan bays, real courses and a full bar, all winter long. Grab a bay
            for an hour, play a league night, or make it a whole season.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <TrackedLink
              href={VENUE.trackmanBookingUrl}
              event="book_bay_hero"
              className="rounded-full bg-accent px-8 py-4 text-lg font-bold text-ink shadow-lg transition hover:bg-accent-dark hover:text-ink"
            >
              Book a bay →
            </TrackedLink>
            <a
              href={`tel:${VENUE.phoneDigits}`}
              className="text-sm font-medium text-white/90 underline-offset-4 hover:underline"
            >
              or call {VENUE.phone}
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-2xl bg-surface p-8 shadow-sm ring-1 ring-white/10">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">
            Registration closes November 15
          </p>
          <h2 className="mt-2 text-2xl font-bold text-brand">Tuesday Night League</h2>
          <p className="mt-2 text-foreground/70">
            Nine holes on TrackMan, individual net Stableford with handicaps, a new course
            every week. Come solo or as a twosome and we&apos;ll pair you up, or bring your
            own foursome.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-foreground/80">
            <li>🕔 Tee times at 5:00 or 7:15 pm</li>
            <li>📅 Handicap nights Nov 17 and 24, scoring Dec 1 to Mar 23</li>
            <li>🏆 Banquet Mar 30 with dinner and a two-hour open bar</li>
            <li>💵 $125 sign-up (covers prizes and the banquet), then $30 a week</li>
          </ul>
          <div className="mt-6 rounded-xl bg-white/5 p-4 text-sm text-foreground/80">
            <span className="font-semibold text-brand">Kickoff night: Tuesday, Nov 3 at 6 pm.</span>{' '}
            Sign up, meet the league and hit some balls. Food and drinks available.
          </div>
          <TrackedLink
            href={leagueMail}
            event="league_rsvp"
            className="mt-6 inline-block rounded-full bg-accent px-8 py-4 text-lg font-bold text-ink shadow transition hover:bg-accent-dark"
          >
            Save my spot →
          </TrackedLink>
          <p className="mt-3 text-sm text-foreground/50">RSVP to {LEAGUE_EMAIL}</p>
        </div>

        <div className="mt-8 rounded-2xl bg-surface p-8 shadow-sm ring-1 ring-white/10">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">
            November through April
          </p>
          <h2 className="mt-2 text-2xl font-bold text-brand">Winter Membership</h2>
          <p className="mt-2 text-foreground/70">
            Keep your swing all winter and play as often as you like.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              ['$1,650', 'Unlimited access, Monday to Thursday'],
              ['$2,250', 'Unlimited access, 7 days a week'],
            ].map(([price, label]) => (
              <div key={price} className="rounded-xl bg-white/5 p-5 text-center">
                <div className="text-3xl font-extrabold text-brand">{price}</div>
                <div className="mt-1 text-sm text-foreground/70">{label}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-foreground/70">
            Members also get 20% off soft goods in the shop.
          </p>
          <TrackedLink
            href={membershipMail}
            event="membership_inquiry"
            className="mt-6 inline-block rounded-full bg-accent px-8 py-4 text-lg font-bold text-ink shadow transition hover:bg-accent-dark"
          >
            Ask about membership →
          </TrackedLink>
          <p className="mt-3 text-sm text-foreground/50">Questions go to {MEMBERSHIP_EMAIL}</p>
        </div>

        <div className="mt-8">
          <div className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-white/10">
            <div className="text-3xl">🗓️</div>
            <h2 className="mt-3 font-bold text-brand">Can&apos;t do Tuesdays?</h2>
            <p className="mt-2 text-sm text-foreground/70">
              We&apos;re building a second league for golfers who can&apos;t make Tuesday
              nights. Details soon.
            </p>
          </div>
        </div>

        <div className="mt-10 text-center">
          <TrackedLink
            href={VENUE.trackmanBookingUrl}
            event="book_bay_footer"
            className="inline-block rounded-full bg-accent px-8 py-4 text-lg font-bold text-ink shadow transition hover:bg-accent-dark"
          >
            Book a bay →
          </TrackedLink>
          <p className="mt-4 text-sm text-foreground/50">
            <a href={`tel:${VENUE.phoneDigits}`} className="font-semibold text-brand hover:underline">
              {VENUE.phone}
            </a>{' '}
            · {VENUE.address}
          </p>
        </div>
      </section>
    </main>
  )
}
