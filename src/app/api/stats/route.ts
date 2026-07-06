import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Public social-proof stats. Dynamic so builds never require a database.
export const dynamic = 'force-dynamic'

export async function GET() {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const [partiesThisMonth, totalConfirmed] = await Promise.all([
    prisma.booking.count({ where: { status: 'CONFIRMED', createdAt: { gte: monthStart } } }),
    prisma.booking.count({ where: { status: 'CONFIRMED' } }),
  ])
  return NextResponse.json({ partiesThisMonth, totalConfirmed })
}
