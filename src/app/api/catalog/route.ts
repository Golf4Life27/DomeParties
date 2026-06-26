import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Catalog for the booking wizard: active packages, F&B, add-ons, and settings.
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
  return NextResponse.json({ setting, packages, fnb, addOns })
}
