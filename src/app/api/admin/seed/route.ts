import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { runSeed } from '@/lib/seed'

// POST /api/admin/seed — load (or reload) the catalog + venue config.
// Admin-gated by middleware. Refuses to run once real bookings exist so a
// stray click can't wipe live catalog wiring.
export async function POST(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1'
  const bookings = await prisma.booking.count()
  if (bookings > 0 && !force) {
    return NextResponse.json(
      { error: `Refusing to reseed: ${bookings} bookings exist. Pass ?force=1 to override.` },
      { status: 409 },
    )
  }
  const counts = await runSeed(prisma)
  return NextResponse.json({ ok: true, counts })
}
