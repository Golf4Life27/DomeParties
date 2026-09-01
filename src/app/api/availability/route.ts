import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { availability } from '@/lib/availability'
import { baysFor } from '@/lib/pricing'
import { refreshVenueDay } from '@/lib/ygb'

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partySize: z.coerce.number().int().min(1).max(300),
  packageId: z.string().min(1),
})

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
  return NextResponse.json({ slots, baysNeeded, durationMinutes: pkg.durationMinutes })
}
