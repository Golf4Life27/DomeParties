import type { VenueProfile } from './profile'
import type { Handoff } from './tools'
import { addDays, formatDate, todayIn } from './clock'

// The pilot price: nothing up front, $20 for each party request the chat
// passes to the venue, never more than $299 in a calendar month, for the
// first 60 days. Only venues with a pilot start date are counted.
export const PILOT = { perRequestCents: 2000, monthlyCapCents: 29900, days: 60, sameGuestDays: 7 } as const

export type PartyRequest = {
  venue: string
  at: Date
  guestName: string
  guestEmail: string | null
  guestPhone: string | null
  partyDate: string
  headcount: number
  summary: string
}

/** Where counted requests are kept. The app uses the database; tests use memory. */
export type PilotStore = {
  /** This venue's counted requests from `from` on, oldest first. */
  since(venue: string, from: Date): Promise<PartyRequest[]>
  add(r: PartyRequest): Promise<void>
}

export type PilotDecision =
  | { count: true; request: PartyRequest; numberThisMonth: number; chargeThisMonthCents: number }
  | { count: false; why: string }

/** What stops a hand-off from counting as a party request. Empty means it counts. */
export function whyNotCounted(h: Handoff): string[] {
  if (h.reason === 'complaint') return ['a complaint']
  if (h.topic !== 'party_or_event') return ['not about a party or event']
  const missing: string[] = []
  if (!h.preferred_date) missing.push('date')
  if (!h.headcount) missing.push('headcount')
  if (!h.guest_name) missing.push('name')
  if (!h.guest_email && !h.guest_phone) missing.push('email or phone')
  return missing.length ? [`missing ${missing.join(', ')}`] : []
}

const email = (e: string | null) => (e ? e.trim().toLowerCase() : null)
const phone = (p: string | null) => {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length >= 7 ? d.slice(-10) : null
}

/** Same email or same phone. */
export function sameGuest(
  a: Pick<PartyRequest, 'guestEmail' | 'guestPhone'>,
  b: Pick<PartyRequest, 'guestEmail' | 'guestPhone'>,
): boolean {
  const ea = email(a.guestEmail)
  const pa = phone(a.guestPhone)
  return (ea != null && ea === email(b.guestEmail)) || (pa != null && pa === phone(b.guestPhone))
}

const DAY = 86_400_000

/** The same guest asking about the same date within 7 days is one request. */
export function isRepeat(earlier: PartyRequest[], r: PartyRequest): boolean {
  return earlier.some((e) => {
    const gap = r.at.getTime() - e.at.getTime()
    return gap >= 0 && gap < PILOT.sameGuestDays * DAY && e.partyDate === r.partyDate && sameGuest(e, r)
  })
}

/** Which pilot day `at` falls on in the venue's own time zone: 0 is the start date, null before it. */
export function pilotDay(p: VenueProfile, at: Date): number | null {
  if (!p.pilot) return null
  const today = todayIn(p.timeZone, at)
  if (today < p.pilot.startDate) return null
  const [y1, m1, d1] = p.pilot.startDate.split('-').map(Number)
  const [y2, m2, d2] = today.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY)
}

/** The last day the pilot counts, as YYYY-MM-DD. */
export function pilotLastDay(p: VenueProfile): string | null {
  return p.pilot ? addDays(p.pilot.startDate, PILOT.days - 1) : null
}

export const monthOf = (p: VenueProfile, at: Date) => todayIn(p.timeZone, at).slice(0, 7)

export const chargeFor = (n: number) => Math.min(n * PILOT.perRequestCents, PILOT.monthlyCapCents)

function toRequest(p: VenueProfile, h: Handoff, at: Date): PartyRequest {
  return {
    venue: p.slug,
    at,
    guestName: h.guest_name!,
    guestEmail: h.guest_email,
    guestPhone: h.guest_phone,
    partyDate: h.preferred_date!,
    headcount: h.headcount!,
    summary: h.summary,
  }
}

/** Decides whether a hand-off counts, without saving it. */
export async function decide(p: VenueProfile, h: Handoff, at: Date, store: PilotStore): Promise<PilotDecision> {
  const day = pilotDay(p, at)
  if (day == null) return { count: false, why: 'no pilot running' }
  if (day >= PILOT.days) return { count: false, why: 'pilot ended' }
  const not = whyNotCounted(h)
  if (not.length) return { count: false, why: not[0] }
  const r = toRequest(p, h, at)
  // Far enough back for both the 7-day repeat check and the whole calendar month.
  const earlier = await store.since(p.slug, new Date(at.getTime() - 40 * DAY))
  if (isRepeat(earlier, r)) return { count: false, why: 'same guest and date within 7 days' }
  const month = monthOf(p, at)
  const n = earlier.filter((e) => monthOf(p, e.at) === month).length + 1
  return { count: true, request: r, numberThisMonth: n, chargeThisMonthCents: chargeFor(n) }
}

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`

/** The line added to a counted lead email, so the venue can check each one as it comes in. */
export function pilotLine(d: Extract<PilotDecision, { count: true }>): string {
  const capped = d.chargeThisMonthCents >= PILOT.monthlyCapCents
  return `PartyDesk pilot: this is party request ${d.numberThisMonth} this month, so ${usd(d.chargeThisMonthCents)} so far${
    capped ? ', which is the $299 monthly cap. Nothing more is added this month.' : ' ($20 each, never more than $299 a month).'
  }`
}

function timeIn(p: VenueProfile, at: Date) {
  return new Intl.DateTimeFormat(p.locale, {
    timeZone: p.timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(at)
}

/** The monthly list a venue gets: every counted request, so they can check it against their own inbox. */
export function monthlyStatement(
  p: VenueProfile,
  month: string,
  all: PartyRequest[],
): { count: number; chargeCents: number; subject: string; text: string } {
  const rows = all
    .filter((r) => r.venue === p.slug && monthOf(p, r.at) === month)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
  const [y, m] = month.split('-').map(Number)
  const label = new Intl.DateTimeFormat(p.locale, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, 15)),
  )
  const charge = chargeFor(rows.length)
  const capped = rows.length * PILOT.perRequestCents > charge
  const last = pilotLastDay(p)
  const lines = [
    `Party requests your website chat passed to you in ${label}.`,
    `Each one reached your inbox when it came in, with the guest's details. $20 each, never more than $299 a month.`,
    '',
    ...(rows.length
      ? rows.map(
          (r, i) =>
            `${i + 1}. ${timeIn(p, r.at)}: ${r.guestName}, ${r.headcount} guests on ${formatDate(p, r.partyDate)}, ${[r.guestEmail, r.guestPhone].filter(Boolean).join(', ')}`,
        )
      : ['No party requests were counted this month.']),
    '',
    `Counted: ${rows.length}. Total for ${label}: ${usd(charge)}${capped ? ' (the monthly cap)' : ''}.`,
    'The same guest asking about the same date again within 7 days is counted once. Complaints and general questions are never counted.',
    ...(last ? [`Your 60-day pilot runs through ${formatDate(p, last)}.`] : []),
    'If a line here never reached you, reply and it comes off.',
  ]
  return {
    count: rows.length,
    chargeCents: charge,
    subject: `${p.name}: ${rows.length} party request${rows.length === 1 ? '' : 's'} in ${label}`,
    text: lines.join('\n'),
  }
}

/** In memory, for tests and previews. */
export function memoryStore(seed: PartyRequest[] = []): PilotStore & { all: PartyRequest[] } {
  const all = [...seed]
  return {
    all,
    async since(venue, from) {
      return all.filter((r) => r.venue === venue && r.at >= from).sort((a, b) => a.at.getTime() - b.at.getTime())
    },
    async add(r) {
      all.push(r)
    },
  }
}
