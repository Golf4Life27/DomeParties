import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { addDays, formatDate, formatTime, hoursOn, isRealDate, todayIn } from './clock'
import type { VenueProfile } from './profile'
import { describeQuote, quote, QuoteError, unitsFor } from './quote'
import { deliverHandoff } from './handoff'

// The agent's hands, for any venue. Every answer is read from the venue's own
// setup, so nothing here knows whether it's serving a dome or a bowling alley.
//
// 'dry' runs everything except the hand-off, which it fakes, so demos and
// replays never email a venue or call its webhook.
export type ToolMode = 'live' | 'dry'

const DATE = z.string().refine(isRealDate, 'not a real YYYY-MM-DD date')
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

export const VENUE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'venue_hours',
    description: 'Opening hours and closures for a run of days at the venue. Use for any "are you open" question and before suggesting a date.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        days: { type: 'integer', description: '1 to 14' },
      },
      required: ['start_date', 'days'],
      additionalProperties: false,
    },
  },
  {
    name: 'party_options',
    description:
      'Every party package, food option and add-on the venue sells, with ids, what each includes, guest limits and prices, plus the deposit, service charge and how booking works. Call before naming a package or a price.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'price_party',
    description:
      'Exact price breakdown for a party, including service charge, tax and deposit. Give the date and start time when known, since peak pricing and opening hours depend on them.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        package_id: { type: 'string' },
        guests: { type: 'integer' },
        date: { type: ['string', 'null'], description: 'YYYY-MM-DD or null' },
        start_time: { type: ['string', 'null'], description: 'HH:MM 24-hour, or null' },
        food_id: { type: ['string', 'null'] },
        food_guests: { type: ['integer', 'null'], description: 'Guests eating, if not everyone; null for everyone' },
        add_ons: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, quantity: { type: 'integer' } },
            required: ['id', 'quantity'],
            additionalProperties: false,
          },
        },
      },
      required: ['package_id', 'guests', 'date', 'start_time', 'food_id', 'food_guests', 'add_ons'],
      additionalProperties: false,
    },
  },
  {
    name: 'booking_link',
    description:
      "The venue's own page where the guest picks a live time and pays the deposit. Call once the guest wants to book, and send them the link it returns.",
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'hand_to_team',
    description:
      "Pass the guest to the venue's team: questions the setup doesn't answer, big or custom events, complaints, or a guest who asks for a person. Only once the guest has given an email or phone.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', enum: ['question', 'big_event', 'custom_request', 'complaint', 'asked_for_person', 'ready_to_book'] },
        summary: { type: 'string', description: 'What the guest wants, in two or three sentences' },
        guest_name: { type: ['string', 'null'] },
        guest_email: { type: ['string', 'null'] },
        guest_phone: { type: ['string', 'null'] },
        preferred_date: { type: ['string', 'null'], description: 'YYYY-MM-DD or null' },
        headcount: { type: ['integer', 'null'] },
      },
      required: ['reason', 'summary', 'guest_name', 'guest_email', 'guest_phone', 'preferred_date', 'headcount'],
      additionalProperties: false,
    },
  },
]

const hoursInput = z.object({ start_date: DATE, days: z.number().int().min(1).max(14) })
const priceInput = z.object({
  package_id: z.string().min(1),
  guests: z.number().int().min(1).max(5000),
  date: DATE.nullable(),
  start_time: TIME.nullable(),
  food_id: z.string().min(1).nullable(),
  food_guests: z.number().int().min(0).max(5000).nullable(),
  add_ons: z.array(z.object({ id: z.string().min(1), quantity: z.number().int().min(1).max(100) })).max(20),
})
const handoffInput = z.object({
  reason: z.enum(['question', 'big_event', 'custom_request', 'complaint', 'asked_for_person', 'ready_to_book']),
  summary: z.string().trim().min(1).max(1500),
  guest_name: z.string().trim().max(120).nullable(),
  guest_email: z.string().trim().email().max(200).nullable(),
  guest_phone: z.string().trim().max(40).nullable(),
  preferred_date: DATE.nullable(),
  headcount: z.number().int().min(1).max(5000).nullable(),
})
export type Handoff = z.infer<typeof handoffInput>

function venueHours(p: VenueProfile, raw: unknown) {
  const { start_date, days } = hoursInput.parse(raw)
  const out = []
  for (let i = 0; i < days; i++) {
    const d = hoursOn(p, addDays(start_date, i))
    out.push({
      date: d.date,
      day: formatDate(p, d.date),
      open: d.closed
        ? `closed${d.note ? ` (${d.note})` : ''}`
        : d.windows.map((w) => `${formatTime(p, w.open)} to ${formatTime(p, w.close)}${w.closesNextDay ? ' (after midnight)' : ''}`).join(', '),
    })
  }
  return { days: out }
}

function partyOptions(p: VenueProfile) {
  const m = (amount: number) => money(p, amount)
  return {
    venue: p.name,
    booked_unit: `${p.unit.singular} (${p.unit.count} in all, up to ${p.unit.guestsPerUnit} guests each)`,
    packages: p.packages.map((pkg) => {
      const pr = pkg.pricing
      const per = pr.type === 'flat' ? 'flat' : pr.type === 'per_person' ? 'per guest' : `per ${p.unit.singular} per hour`
      const price = `${m(pr.amount)} ${per}${pr.peakAmount != null ? `, ${m(pr.peakAmount)} at peak times` : ''}`
      const example =
        pr.type === 'per_unit_hour'
          ? `${pkg.minGuests} guests need ${unitsFor(p, pkg.minGuests, pr.minUnits)} ${p.unit.plural}`
          : null
      return {
        id: pkg.id,
        name: pkg.name,
        description: pkg.description,
        includes: pkg.includes,
        hours: pkg.durationMinutes / 60,
        guests: `${pkg.minGuests} to ${pkg.maxGuests}`,
        days: pkg.days.length ? pkg.days : 'every open day',
        price,
        ...(example ? { sizing: example } : {}),
      }
    }),
    food: p.food.map((f) => ({ id: f.id, name: f.name, description: f.description, price: `${m(f.amount)} ${f.pricing === 'per_person' ? 'per guest' : 'flat'}` })),
    add_ons: p.addOns.map((a) => ({ id: a.id, name: a.name, description: a.description, price: `${m(a.amount)} ${a.unit === 'per_person' ? 'per guest' : 'each'}` })),
    peak_times: p.peak.days.length ? { days: p.peak.days, from: p.peak.from ? formatTime(p, p.peak.from) : 'all day' } : 'none',
    deposit: p.deposit.flat != null ? m(p.deposit.flat) : p.deposit.percent != null ? `${p.deposit.percent}% of the total` : 'none',
    service_charge: p.serviceCharge.percent
      ? {
          percent: p.serviceCharge.percent,
          applies: { all: 'on every party', with_food: 'only on parties that include food', food_only: 'on the food only' }[p.serviceCharge.appliesTo],
          what_it_covers: p.serviceCharge.note || null,
        }
      : 'none',
    tax_percent: p.taxPercent,
    book_at_least_days_ahead: p.booking.leadTimeDays,
    how_booking_works: p.booking.howItWorks || null,
    booked_elsewhere: p.otherLinks,
  }
}

function money(p: VenueProfile, amount: number) {
  return new Intl.NumberFormat(p.locale, { style: 'currency', currency: p.currency }).format(amount)
}

function price(p: VenueProfile, raw: unknown, today: string) {
  const r = priceInput.parse(raw)
  if (r.date && r.date < addDays(today, p.booking.leadTimeDays)) {
    return { error: `Parties need booking at least ${p.booking.leadTimeDays} days ahead. The earliest date is ${addDays(today, p.booking.leadTimeDays)}.` }
  }
  try {
    const q = quote(p, {
      packageId: r.package_id,
      guests: r.guests,
      date: r.date,
      start: r.start_time,
      foodId: r.food_id,
      foodGuests: r.food_guests,
      addOns: r.add_ons,
    })
    return describeQuote(p, q)
  } catch (e) {
    if (e instanceof QuoteError) return { error: e.message }
    throw e
  }
}

function bookingLink(p: VenueProfile) {
  if (!p.booking.partyUrl) {
    return { link: null, note: 'This venue books parties through its team. Get a name and email or phone and use hand_to_team with reason ready_to_book.' }
  }
  return {
    link: p.booking.partyUrl,
    how_it_works: p.booking.howItWorks || 'Pick a time and pay the deposit there.',
    note: 'That page shows live times. Nothing is held until the guest finishes there.',
  }
}

async function handToTeam(p: VenueProfile, raw: unknown, mode: ToolMode) {
  const h = handoffInput.parse(raw)
  if (!h.guest_email && !h.guest_phone) {
    return {
      error: `Not sent: the team has no way to reach this guest. Ask for an email or phone. If they'd rather not, give them ${p.phone ? `the phone number ${p.phone}` : 'the website'} and don't mention this note.`,
    }
  }
  if (mode === 'dry') return { passed_to_team: true, note: 'Demo: nothing was sent.' }
  const sent = await deliverHandoff(p, h)
  if (!sent) return { error: `Couldn't reach the team just now. Give the guest ${p.phone ? `the phone number ${p.phone}` : 'the website'} instead.` }
  return { passed_to_team: true }
}

export async function runVenueTool(p: VenueProfile, name: string, input: unknown, mode: ToolMode, today = todayIn(p.timeZone)): Promise<string> {
  try {
    let out: unknown
    switch (name) {
      case 'venue_hours':
        out = venueHours(p, input)
        break
      case 'party_options':
        out = partyOptions(p)
        break
      case 'price_party':
        out = price(p, input, today)
        break
      case 'booking_link':
        out = bookingLink(p)
        break
      case 'hand_to_team':
        out = await handToTeam(p, input, mode)
        break
      default:
        out = { error: `No tool called ${name}` }
    }
    return JSON.stringify(out)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return JSON.stringify({ error: 'Bad input', issues: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
    }
    console.error(`[venue-agent] ${p.slug} tool ${name} failed`, e)
    return JSON.stringify({ error: 'That failed. Point the guest to the venue phone or website instead.' })
  }
}
