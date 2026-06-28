import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Cancel a booking and free its bays (delete resource holds).
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const booking = await prisma.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.$transaction([
    prisma.bookingResource.deleteMany({ where: { bookingId: id } }),
    prisma.booking.update({ where: { id }, data: { status: 'CANCELLED' } }),
  ])
  return NextResponse.json({ ok: true })
}
