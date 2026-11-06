import { z } from 'zod'

// One venue's whole setup. Everything the agent says about a venue comes from
// here, so a dome, a bowling alley, a sim lounge in London or a range in Tokyo
// all run on the same code: adding a venue means adding one of these, never
// writing code.

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM, 24-hour')
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type Weekday = (typeof WEEKDAYS)[number]
const WEEKDAY = z.enum(WEEKDAYS)

/** A close earlier than the open means the venue closes after midnight. */
const window = z.object({ open: TIME, close: TIME })

const money = z.number().min(0).max(1_000_000)

const pricing = z.discriminatedUnion('type', [
  /** One price for the whole party, whatever the headcount. */
  z.object({ type: z.literal('flat'), amount: money, peakAmount: money.nullable().default(null) }),
  /** Price per guest. tiers: lower per-guest prices for bigger groups ("$23 each, $21 each for 3 or more"),
   * each from minGuests up. amount is the price before any tier applies. */
  z.object({
    type: z.literal('per_person'),
    amount: money,
    peakAmount: money.nullable().default(null),
    tiers: z.array(z.object({ minGuests: z.number().int().min(2).max(1000), amount: money })).max(6).default([]),
  }),
  /**
   * Price per bay, lane or simulator per hour. The number of units is enough
   * for the headcount (guestsPerUnit), never fewer than minUnits.
   */
  z.object({
    type: z.literal('per_unit_hour'),
    amount: money,
    peakAmount: money.nullable().default(null),
    minUnits: z.number().int().min(1).max(500).default(1),
    /** Set when this package books its own space rather than the venue's usual
     * unit, like a private room for up to 6: guests per booking of it. */
    guestsPerUnit: z.number().int().min(1).max(500).nullable().default(null),
  }),
])

export const venueProfileSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['golf_dome', 'indoor_golf', 'driving_range', 'bowling', 'family_entertainment', 'other']),
  /** True for the made-up venues that show the product. The agent says so if asked. */
  sample: z.boolean().default(false),
  /** True for a real venue's chat that we set up from its public website for
   * the owner to try, before they've signed up. Always runs as a demo: nothing
   * is sent to the venue, and the agent says what it is if asked. */
  prospect: z.boolean().default(false),

  /** BCP 47 locale for dates and money, e.g. en-US, en-GB, ja-JP. */
  locale: z.string().min(2).max(20),
  /** Language the agent writes in unless the guest writes in another one. */
  language: z.string().min(2).max(40),
  /** ISO 4217, e.g. USD, GBP, JPY. */
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** IANA time zone, e.g. America/Chicago, Europe/London, Asia/Tokyo. */
  timeZone: z.string().min(3).max(60),

  address: z.string().max(300).default(''),
  phone: z.string().max(40).default(''),
  website: z.string().url().nullable().default(null),

  /** What gets booked, in the venue's own words: bay, lane, simulator, suite. */
  unit: z.object({
    singular: z.string().min(1).max(30),
    plural: z.string().min(1).max(30),
    /** Null when the venue's website doesn't say how many it has. */
    count: z.number().int().min(1).max(1000).nullable(),
    guestsPerUnit: z.number().int().min(1).max(50),
  }),

  /** Regular hours by weekday. A missing or empty day means closed. */
  hours: z.record(WEEKDAY, z.array(window).max(3)),
  /** False when the website doesn't list opening hours at all. The agent then
   * says the team will confirm times instead of calling every day closed. */
  hoursListed: z.boolean().default(true),
  /** Days the website gives hours for that couldn't be read (garbled or contradictory). Not closed:
   * the agent says the team confirms that day's times. */
  hoursUnclear: z.array(WEEKDAY).max(7).default([]),
  closures: z.array(z.object({ date: DATE, note: z.string().max(120).default('') })).max(366).default([]),

  /** When peak prices apply: on `days` from `from` onwards (all day if
   * `from` is null), and on `allDay` days all day. Many venues price weekday
   * evenings and whole weekends the same, which takes both. Empty lists mean
   * there's no peak pricing. */
  peak: z
    .object({
      days: z.array(WEEKDAY).max(7).default([]),
      from: TIME.nullable().default(null),
      allDay: z.array(WEEKDAY).max(7).default([]),
    })
    .default({ days: [], from: null, allDay: [] }),

  /** Charges the venue's website doesn't mention. Zero tax or no deposit in
   * the setup then means "not stated", not "none", and the agent says the
   * team will confirm instead of telling a guest there's no tax. */
  notStated: z.array(z.enum(['tax', 'deposit', 'service_charge'])).max(3).default([]),

  booking: z.object({
    /** Where a guest books and pays for a party. The agent sends guests here. */
    partyUrl: z.string().url().nullable(),
    /** One plain sentence on how booking works there. */
    howItWorks: z.string().max(300).default(''),
    /** Days ahead a party has to be booked. */
    leadTimeDays: z.number().int().min(0).max(90).default(0),
  }),
  /** Other things the venue sells that are booked elsewhere (casual bay time, open bowling, gift cards). */
  otherLinks: z.array(z.object({ what: z.string().max(80), url: z.string().url() })).max(10).default([]),

  deposit: z
    .object({ percent: z.number().min(0).max(100).nullable().default(null), flat: money.nullable().default(null) })
    .default({ percent: null, flat: null }),
  taxPercent: z.number().min(0).max(40).default(0),
  /** True when tax is charged on top of the service charge too. */
  taxOnServiceCharge: z.boolean().default(false),
  serviceCharge: z
    .object({
      percent: z.number().min(0).max(40).default(0),
      /** all: on the whole order. with_food: on the whole order, only when it includes food. food_only: only on the food. */
      appliesTo: z.enum(['all', 'with_food', 'food_only']).default('all'),
      /** What it pays for, in a sentence, so the agent can explain it. */
      note: z.string().max(200).default(''),
    })
    .default({ percent: 0, appliesTo: 'all', note: '' }),

  packages: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{1,40}$/),
        name: z.string().max(80),
        description: z.string().max(400).default(''),
        includes: z.array(z.string().max(120)).max(12).default([]),
        durationMinutes: z.number().int().min(15).max(1440),
        minGuests: z.number().int().min(1).max(1000).default(1),
        maxGuests: z.number().int().min(1).max(5000),
        /** Weekdays it's sold. Empty means every open day. */
        days: z.array(WEEKDAY).max(7).default([]),
        pricing,
        /** False when the website gives no price for it ("call for pricing").
         * The agent then offers a quote from the team instead of a number. */
        priceListed: z.boolean().default(true),
        /** True when the website only gives a starting price ("from $25"). */
        priceFrom: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(30),
  food: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{1,40}$/),
        name: z.string().max(80),
        description: z.string().max(300).default(''),
        pricing: z.enum(['per_person', 'flat']),
        amount: money,
        /** The top of a price the venue lists as a range ("$15 to $18"); amount is the bottom. */
        amountTo: money.nullable().default(null),
      }),
    )
    .max(30)
    .default([]),
  addOns: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{1,40}$/),
        name: z.string().max(80),
        description: z.string().max(300).default(''),
        unit: z.enum(['each', 'per_person']),
        amount: money,
        /** The top of a price the venue lists as a range ("$15 to $18"); amount is the bottom. */
        amountTo: money.nullable().default(null),
      }),
    )
    .max(30)
    .default([]),

  /** Questions guests ask and the venue's own answers. The agent answers only from these and the fields above. */
  faq: z.array(z.object({ q: z.string().max(200), a: z.string().max(800) })).max(60).default([]),

  /** Where hand-offs go. The agent asks the guest for an email or phone first. */
  handoff: z.object({ email: z.string().email().nullable().default(null), webhookUrl: z.string().url().nullable().default(null) }),
})

export type VenueProfile = z.infer<typeof venueProfileSchema>
export type VenueProfileInput = z.input<typeof venueProfileSchema>

export function parseProfile(raw: unknown): VenueProfile {
  const p = venueProfileSchema.parse(raw)
  // Checks a schema can't express.
  checkTimeZone(p.timeZone)
  new Intl.NumberFormat(p.locale, { style: 'currency', currency: p.currency })
  const ids = new Set<string>()
  for (const id of [...p.packages.map((x) => x.id), ...p.food.map((x) => x.id), ...p.addOns.map((x) => x.id)]) {
    if (ids.has(id)) throw new Error(`Duplicate id "${id}" in packages, food or add-ons`)
    ids.add(id)
  }
  for (const pkg of p.packages) {
    if (pkg.minGuests > pkg.maxGuests) throw new Error(`${pkg.name}: minGuests is more than maxGuests`)
  }
  return p
}

function checkTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    throw new Error(`Unknown time zone "${tz}"`)
  }
}
