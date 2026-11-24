import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { partiesBookedThisMonth } from '@/lib/admin-stats'

// Public social-proof stats. Dynamic so builds never require a database.
export const dynamic = 'force-dynamic'

export async function GET() {
  const [partiesThisMonth, totalConfirmed] = await Promise.all([
    partiesBookedThisMonth(),
    prisma.booking.count({ where: { depositPaid: true, status: { in: ['CONFIRMED', 'COMPLETED'] } } }),
  ])
  return NextResponse.json({ partiesThisMonth, totalConfirmed })
}
