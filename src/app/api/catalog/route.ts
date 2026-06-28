import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getBayRate } from '@/lib/pricing'

// Catalog for the booking wizard: active packages, F&B, add-ons, and settings.
// Each package gets a display price: BAY_RATE → a "from" estimate; otherwise the
// per-person or flat price.
export async function GET() {
  const [setting, packages, fnb, addOns] = await Promise.all([
    prisma.setting.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.package.findMany({
      where: { active: true, eventType: 'BIRTHDAY' },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.fnbPackage.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.addOn.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
  ])

  const enriched = await Promise.all(
    packages.map(async (p) => {
      let displayPrice = p.flatPrice
      let displayUnit: 'from' | 'guest' | 'flat' = 'flat'
      if (p.pricingType === 'BAY_RATE') {
        const { rate } = await getBayRate(p.bays)
        displayPrice = Math.round(p.bays * (p.durationMinutes / 60) * rate)
        displayUnit = 'from'
      } else if (p.pricingType === 'PER_PERSON') {
        displayPrice = p.pricePerPerson
        displayUnit = 'guest'
      }
      return { ...p, displayPrice, displayUnit }
    }),
  )

  return NextResponse.json({ setting, packages: enriched, fnb, addOns })
}
