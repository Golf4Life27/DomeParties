import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { seedHours } from '@/lib/seed'

// POST /api/admin/hours/reseed — replace the hours ruleset with the current
// defaults. Safe: touches ONLY OperatingHours (no bookings, bays, or catalog),
// unlike the full catalog reload.
export async function POST() {
  const res = await seedHours(prisma)
  return NextResponse.json({ ok: true, ...res })
}
