import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Mark a confirmed booking as completed (e.g. after the event).
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const booking = await prisma.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (booking.status !== 'CONFIRMED') {
    return NextResponse.json({ error: 'Only confirmed bookings can be completed' }, { status: 409 })
  }
  await prisma.booking.update({ where: { id }, data: { status: 'COMPLETED' } })
  return NextResponse.json({ ok: true })
}
