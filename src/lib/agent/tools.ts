import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { availability } from '@/lib/availability'
import { baysFor, computeQuote, getBayRate } from '@/lib/pricing'
import { createDraft, updateDraft } from '@/lib/booking'
import { notifyStaff } from '@/lib/notify'
import { bookingToken } from '@/lib/sign'
import { refreshVenueDay } from '@/lib/ygb'
import { describeWindow, hoursContext } from '@/lib/hours'
import { addDays, formatDateLong, minutesToLabelWithDay, todayStr } from '@/lib/time'

// The chat agent's hands. Every price, time and hold goes through the same code
// the booking wizard uses, so the agent can never quote a number the checkout
// won't honour. It never touches money: start_booking leaves a DRAFT and hands
// the guest the wizard's own resume link, where checkout places the hold and
// Stripe takes the deposit exactly as it does for a guest who never chatted.
//
// 'dry' runs the read tools for real and fakes the two that write, so the
// replay script can run real guest chats without creating drafts, leads or
// staff emails.
export type ToolMode = 'live' | 'dry'

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const EVENT_TYPES = ['BIRTHDAY', 'GROUP', 'CORPORATE', 'LEAGUE', 'BACHELOR', 'OTHER'] as const

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'dome_hours',
    description:
      'Party hours, public golf hours and closures for a run of days. Use for any "are you open" or "when do you open" question, and before suggesting a date.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        days: { type: 'integer', description: 'How many days to list, 1 to 14' },
      },
      required: ['start_date', 'days'],
      additionalProperties: false,
    },
  },
  {
    name: 'party_options',
    description:
      'Every party package, food package and add-on the dome sells, with ids, what each includes, guest limits and starting prices, plus bay capacity and the deposit percent. Call before naming a package or a price.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'check_times',
    description:
      'Open start times for one package on one date. If nothing is open it says why (closed, too soon to book online, or full) and gives the next date that works.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        party_size: { type: 'integer', description: 'Golfers' },
        package_id: { type: 'string' },
      },
      required: ['date', 'party_size', 'package_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'price_party',
    description:
      'Exact price breakdown from the booking system, including service charge, tax and the deposit. Give a date and start time when known: weekend and peak pricing depends on them.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        package_id: { type: 'string' },
        party_size: { type: 'integer', description: 'Golfers' },
        food_package_id: { type: ['string', 'null'] },
        food_only_guests: { type: 'integer', description: 'Extra guests eating but not golfing; 0 if none' },
        add_ons: {
          type: 'array',
          items: {
            type: 'object',
            properties: { add_on_id: { type: 'string' }, quantity: { type: 'integer' } },
            required: ['add_on_id', 'quantity'],
            additionalProperties: false,
          },
        },
        date: { type: ['string', 'null'], description: 'YYYY-MM-DD or null' },
        start_minutes: { type: ['integer', 'null'], description: 'Minutes after midnight, from check_times' },
      },
      required: ['package_id', 'party_size', 'food_package_id', 'food_only_guests', 'add_ons', 'date', 'start_minutes'],
      additionalProperties: false,
    },
  },
  {
    name: 'start_booking',
    description:
      'Save the guest\'s party and get their personal link to finish it. The link opens the booking page with everything filled in; the date is held and the deposit paid there. Only call once the guest has said they want to book and has given their name and email, and the time came from check_times.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        guest_name: { type: 'string' },
        guest_email: { type: 'string' },
        guest_phone: { type: ['string', 'null'] },
        event_type: { type: 'string', enum: [...EVENT_TYPES] },
        package_id: { type: 'string' },
        party_size: { type: 'integer' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        start_minutes: { type: 'integer' },
        food_package_id: { type: ['string', 'null'] },
        food_only_guests: { type: 'integer' },
        notes: { type: ['string', 'null'], description: 'Anything the team should know, in a sentence' },
      },
      required: [
        'guest_name',
        'guest_email',
        'guest_phone',
        'event_type',
        'package_id',
        'party_size',
        'date',
        'start_minutes',
        'food_package_id',
        'food_only_guests',
        'notes',
      ],
      additionalProperties: false,
    },
  },
  {
    name: 'hand_to_team',
    description:
      'Pass the conversation to the events team: questions you can\'t answer from your tools (lessons, junior programs, policies, donations, vendors), big or custom events, complaints, or a guest who asks for a person. Get a name and an email or phone first when the guest is willing.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', enum: ['question', 'big_event', 'custom_request', 'vendor_or_donation', 'complaint', 'asked_for_person'] },
        summary: { type: 'string', description: 'What the guest wants, in two or three sentences' },
        guest_name: { type: ['string', 'null'] },
        guest_email: { type: ['string', 'null'] },
        guest_phone: { type: ['string', 'null'] },
        event_type: { type: 'string', enum: [...EVENT_TYPES], description: 'OTHER when the guest has not said' },
        preferred_date: { type: ['string', 'null'], description: 'YYYY-MM-DD or null' },
        headcount: { type: ['integer', 'null'] },
      },
      required: ['reason', 'summary', 'guest_name', 'guest_email', 'guest_phone', 'event_type', 'preferred_date', 'headcount'],
      additionalProperties: false,
    },
  },
]

// Strict tool use guarantees the shape; these re-check the ranges and formats a
// JSON schema can't, and turn a bad value into an answer the agent can fix.
const hoursInput = z.object({ start_date: DATE, days: z.number().int().min(1).max(14) })
const timesInput = z.object({ date: DATE, party_size: z.number().int().min(1).max(300), package_id: z.string().min(1) })
const priceInput = z.object({
  package_id: z.string().min(1),
  party_size: z.number().int().min(1).max(300),
  food_package_id: z.string().min(1).nullable(),
  food_only_guests: z.number().int().min(0).max(300),
  add_ons: z.array(z.object({ add_on_id: z.string().min(1), quantity: z.number().int().min(1).max(50) })).max(20),
  date: DATE.nullable(),
  start_minutes: z.number().int().min(0).max(1559).nullable(),
})
const bookingInput = z.object({
  guest_name: z.string().trim().min(1).max(120),
  guest_email: z.string().trim().email().max(200),
  guest_phone: z.string().trim().max(40).nullable(),
  event_type: z.enum(EVENT_TYPES),
  package_id: z.string().min(1),
  party_size: z.number().int().min(1).max(300),
  date: DATE,
  start_minutes: z.number().int().min(0).max(1559),
  food_package_id: z.string().min(1).nullable(),
  food_only_guests: z.number().int().min(0).max(300),
  notes: z.string().max(1000).nullable(),
})
const handoffInput = z.object({
  reason: z.enum(['question', 'big_event', 'custom_request', 'vendor_or_donation', 'complaint', 'asked_for_person']),
  summary: z.string().trim().min(1).max(1500),
  guest_name: z.string().trim().max(120).nullable(),
  guest_email: z.string().trim().email().max(200).nullable(),
  guest_phone: z.string().trim().max(40).nullable(),
  event_type: z.enum(EVENT_TYPES),
  preferred_date: DATE.nullable(),
  headcount: z.number().int().min(1).max(1000).nullable(),
})

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

async function baysNeededFor(packageId: string, partySize: number) {
  const [setting, pkg] = await Promise.all([
    prisma.setting.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.package.findUnique({ where: { id: packageId } }),
  ])
  if (!pkg || !pkg.active) return null
  // Same rule as /api/availability, so the agent offers exactly what the wizard would.
  const bays =
    pkg.pricingType === 'BAY_RATE'
      ? pkg.dynamicBays
        ? Math.max(pkg.bays, baysFor(partySize, setting.bayCapacity))
        : pkg.bays
      : baysFor(partySize, setting.bayCapacity)
  return { pkg, setting, bays }
}

async function domeHours(raw: unknown) {
  const { start_date, days } = hoursInput.parse(raw)
  const out = []
  for (let i = 0; i < days; i++) {
    const d = addDays(start_date, i)
    const ctx = await hoursContext(d)
    out.push({
      date: d,
      day: formatDateLong(d),
      public_golf: describeWindow(ctx.golf),
      parties: describeWindow(ctx.party),
      closures: ctx.closures.map((c) => describeWindow(c)),
    })
  }
  return { days: out }
}

async function partyOptions() {
  const [setting, packages, fnb, addOns] = await Promise.all([
    prisma.setting.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.package.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.fnbPackage.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.addOn.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
  ])
  const pkgs = await Promise.all(
    packages.map(async (p) => {
      // Mirrors /api/catalog's display price.
      let price = `${dollars(p.flatPrice)} flat`
      if (p.pricingType === 'BAY_RATE') {
        const { perBayTotal } = await getBayRate(p.bays, p.durationMinutes / 60, null, null, p.rateTag)
        price = `from ${dollars(p.bays * perBayTotal)} (depends on day and time)`
      } else if (p.pricingType === 'PER_PERSON') {
        price = `${dollars(p.pricePerPerson)} per guest`
      }
      return {
        id: p.id,
        name: p.name,
        event_type: p.eventType,
        description: p.description,
        includes: p.includes,
        hours: p.durationMinutes / 60,
        bays: p.dynamicBays ? `at least ${p.bays}, more for bigger groups` : p.bays,
        guests: `${p.minGuests} to ${p.maxGuests}`,
        price,
      }
    }),
  )
  return {
    golfers_per_bay: setting.bayCapacity,
    deposit_percent: setting.depositPercent,
    book_online_at_least_days_ahead: setting.leadTimeDaysOnline,
    packages: pkgs,
    food: fnb.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      price: f.pricingType === 'PER_PERSON' ? `${dollars(f.price)} per guest` : `${dollars(f.price)} flat`,
      dietary: f.dietaryNotes,
    })),
    add_ons: addOns.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      description: a.description,
      price: `${dollars(a.price)} ${a.unit === 'PER_PERSON' ? 'per guest' : a.unit === 'PER_30_MIN' ? 'per 30 minutes' : 'each'}`,
    })),
  }
}

async function openTimes(date: string, partySize: number, packageId: string, mode: ToolMode) {
  const found = await baysNeededFor(packageId, partySize)
  if (!found) return { error: 'Unknown package id. Call party_options for the current ids.' }
  const { pkg, setting, bays } = found
  if (partySize > pkg.maxGuests) {
    return { error: `${pkg.name} takes up to ${pkg.maxGuests} guests. Pick a bigger package or hand to the team.` }
  }
  // Live occupancy refresh hits Trackman; the replay skips it and reads cached data.
  if (mode === 'live') await refreshVenueDay(date).catch(() => null)
  const slots = await availability.getSlots(date, bays, pkg.durationMinutes)
  if (slots.length > 0) {
    return {
      date,
      day: formatDateLong(date),
      bays_needed: bays,
      hours: pkg.durationMinutes / 60,
      open_starts: slots.map((s) => ({
        start_minutes: s.startMinutes,
        starts: s.label,
        ends: minutesToLabelWithDay(s.endMinutes),
        peak_pricing: s.peak,
        runs_past_public_close: !!s.afterHours,
      })),
    }
  }
  const ctx = await hoursContext(date)
  const earliest = addDays(todayStr(), setting.leadTimeDaysOnline)
  const why = !ctx.party ? 'closed for parties that day' : date < earliest ? 'too soon to book online' : 'full'
  let next: string | null = null
  const from = date < earliest ? earliest : addDays(date, 1)
  for (let i = 0; i < 21 && !next; i++) {
    const candidate = addDays(from, i)
    if ((await availability.getSlots(candidate, bays, pkg.durationMinutes)).length > 0) next = candidate
  }
  return { date, open_starts: [], why, next_open_date: next, next_open_day: next ? formatDateLong(next) : null }
}

async function price(raw: unknown) {
  const p = priceInput.parse(raw)
  try {
    const q = await computeQuote({
      packageId: p.package_id,
      partySize: p.party_size,
      fnbGuests: p.food_only_guests,
      fnbPackageId: p.food_package_id,
      addOns: p.add_ons.map((a) => ({ addOnId: a.add_on_id, quantity: a.quantity })),
      dateStr: p.date,
      startMinutes: p.start_minutes,
    })
    return {
      estimate_only: q.estimated,
      lines: q.lines.map((l) => ({ item: l.label, detail: l.detail ?? null, amount: dollars(l.amount) })),
      service_charge: dollars(q.serviceCharge),
      tax: dollars(q.taxAmount),
      total: dollars(q.total),
      deposit_today: dollars(q.depositAmount),
      balance_later: dollars(q.balanceDue),
    }
  } catch {
    return { error: 'Could not price that. Check the ids with party_options.' }
  }
}

async function startBooking(raw: unknown, mode: ToolMode) {
  const b = bookingInput.parse(raw)
  // Re-check the time is still open: a guest who chatted for ten minutes may be
  // asking for a slot someone else just took.
  const times = await openTimes(b.date, b.party_size, b.package_id, mode)
  if ('error' in times) return times
  if (!times.open_starts.some((s) => s.start_minutes === b.start_minutes)) {
    return { error: 'That start time is no longer open. Run check_times again and offer what is.' }
  }
  if (mode === 'dry') {
    return { booking_link: `${appUrl()}/book?draft=DRY_RUN`, note: 'Dry run: nothing saved.' }
  }
  const draft = await createDraft(b.guest_email, b.event_type, { landingPath: '/chat' })
  await updateDraft(draft.id, {
    dateStr: b.date,
    startMinutes: b.start_minutes,
    partySize: b.party_size,
    fnbGuests: b.food_only_guests,
    packageId: b.package_id,
    fnbPackageId: b.food_package_id,
    customerName: b.guest_name,
    customerEmail: b.guest_email,
    ...(b.guest_phone ? { customerPhone: b.guest_phone } : {}),
    ...(b.notes ? { notes: b.notes } : {}),
  })
  return {
    booking_link: `${appUrl()}/book?draft=${draft.id}&t=${bookingToken(draft.id)}`,
    reference: draft.reference,
    note: 'The date is not held until they check out on that page and pay the deposit.',
  }
}

async function handToTeam(raw: unknown, mode: ToolMode) {
  const h = handoffInput.parse(raw)
  // A hand-off nobody can answer is worse than none: send the guest back for
  // a way to reach them, or to the phone if they won't give one.
  if (!h.guest_email && !h.guest_phone) {
    return {
      error:
        'Not sent: the team has no way to reach this guest. Ask for an email or phone. If they would rather not, give them the dome phone number instead and do not mention this note.',
    }
  }
  if (mode === 'dry') return { passed_to_team: true, note: 'Dry run: no lead or email.' }

  let leadPath = '/admin/leads'
  if (h.guest_email && h.guest_name) {
    const lead = await prisma.lead.create({
      data: {
        eventType: h.event_type,
        preferredDate: h.preferred_date ? new Date(`${h.preferred_date}T00:00:00.000Z`) : null,
        headcountMin: h.headcount,
        headcountMax: h.headcount,
        customerName: h.guest_name,
        customerEmail: h.guest_email,
        customerPhone: h.guest_phone,
        message: h.summary,
        source: 'chat',
        // The team is picking this up by hand from the alert below, so the
        // automatic 24h "still planning?" email would only cross wires.
        followUpSentAt: new Date(),
      },
      select: { id: true },
    })
    leadPath = `/admin/leads/${lead.id}`
  }
  await notifyStaff({
    title: `Chat handoff: ${h.reason.replace(/_/g, ' ')}`,
    lines: [
      h.summary,
      ...(h.preferred_date ? [`Date: ${formatDateLong(h.preferred_date)}`] : []),
      ...(h.headcount ? [`Headcount: ${h.headcount}`] : []),
      ...(h.guest_name ? [`Guest: ${h.guest_name}`] : ['Guest gave no name']),
    ],
    adminPath: leadPath,
    contact: { email: h.guest_email, phone: h.guest_phone },
  })
  return {
    passed_to_team: true,
    can_reach_guest: !!(h.guest_email || h.guest_phone),
  }
}

/** Run one tool call. Always returns JSON text, errors included, so the agent can recover. */
export async function runTool(name: string, input: unknown, mode: ToolMode): Promise<string> {
  try {
    let out: unknown
    switch (name) {
      case 'dome_hours':
        out = await domeHours(input)
        break
      case 'party_options':
        out = await partyOptions()
        break
      case 'check_times': {
        const t = timesInput.parse(input)
        out = await openTimes(t.date, t.party_size, t.package_id, mode)
        break
      }
      case 'price_party':
        out = await price(input)
        break
      case 'start_booking':
        out = await startBooking(input, mode)
        break
      case 'hand_to_team':
        out = await handToTeam(input, mode)
        break
      default:
        out = { error: `No tool called ${name}` }
    }
    return JSON.stringify(out)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return JSON.stringify({ error: 'Bad input', issues: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
    }
    console.error(`[agent] tool ${name} failed`, e)
    return JSON.stringify({ error: 'That failed. Give the guest the dome phone number instead.' })
  }
}
