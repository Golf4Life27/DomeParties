import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { availability } from '@/lib/availability'
import { baysFor } from '@/lib/pricing'
import { refreshVenueDay } from '@/lib/ygb'
import { hoursContext } from '@/lib/hours'
import { addDays, todayStr } from '@/lib/time'

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partySize: z.coerce.number().int().min(1).max(300),
  packageId: z.string().min(1),
})

/** How far forward to look for a date that IS bookable. */
const NEXT_OPEN_SCAN_DAYS = 21

/** Why a date came back with nothing. The customer is owed the real reason. */
export type EmptyReason = 'closed' | 'too_soon' | 'full'

// GET /api/availability?date=YYYY-MM-DD&partySize=12&packageId=...
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const parsed = schema.safeParse({
    date: sp.get('date'),
    partySize: sp.get('partySize'),
    packageId: sp.get('packageId'),
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query', details: parsed.error.issues }, { status: 400 })
  }
  const { date, partySize, packageId } = parsed.data
  const [setting, pkg] = await Promise.all([
    prisma.setting.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.package.findUnique({ where: { id: packageId } }),
  ])
  if (!pkg) return NextResponse.json({ error: 'Unknown package' }, { status: 404 })

  const baysNeeded =
    pkg.pricingType === 'BAY_RATE'
      ? pkg.dynamicBays
        ? Math.max(pkg.bays, baysFor(partySize, setting.bayCapacity))
        : pkg.bays
      : baysFor(partySize, setting.bayCapacity)

  // Refresh Trackman occupancy before listing, so a window they have already
  // sold is never offered. Checkout re-checks regardless — this is about not
  // showing someone a time and taking it back at the payment step. Cached for a
  // minute so clicking through dates doesn't refetch per click, and never fatal:
  // slot listing degrades to the last known occupancy rather than failing.
  await refreshVenueDay(date).catch(() => null)

  const slots = await availability.getSlots(date, baysNeeded, pkg.durationMinutes)

  // An empty list is the single most common thing a customer sees, and until now
  // it said "weekends fill up fast" no matter the cause — telling someone the
  // venue is busy when in fact it is closed that day. They conclude the place is
  // unreachable and leave. So work out which it actually is, and hand back the
  // next date that genuinely works so the answer is a click rather than a guess.
  let emptyReason: EmptyReason | null = null
  let nextAvailableDate: string | null = null

  if (slots.length === 0) {
    const ctx = await hoursContext(date)
    const earliestOnline = addDays(todayStr(), setting.leadTimeDaysOnline)
    emptyReason = !ctx.party ? 'closed' : date < earliestOnline ? 'too_soon' : 'full'

    // Scan forward for a date that works. Deliberately no Trackman refresh in
    // this loop: it would fire one external request per day scanned, to decide
    // a hint. Cached occupancy is plenty for pointing at a date, and the real
    // check runs when they pick it.
    const from = date < earliestOnline ? earliestOnline : addDays(date, 1)
    for (let i = 0; i < NEXT_OPEN_SCAN_DAYS; i++) {
      const candidate = addDays(from, i)
      const found = await availability.getSlots(candidate, baysNeeded, pkg.durationMinutes)
      if (found.length > 0) {
        nextAvailableDate = candidate
        break
      }
    }
  }

  return NextResponse.json({
    slots,
    baysNeeded,
    durationMinutes: pkg.durationMinutes,
    emptyReason,
    nextAvailableDate,
  })
}
