import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Public social-proof stats. Cached briefly to keep it cheap.
export const revalidate = 300

export async function GET() {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const [partiesThisMonth, totalConfirmed] = await Promise.all([
    prisma.booking.count({ where: { status: 'CONFIRMED', createdAt: { gte: monthStart } } }),
    prisma.booking.count({ where: { status: 'CONFIRMED' } }),
  ])
  return NextResponse.json({ partiesThisMonth, totalConfirmed })
}
