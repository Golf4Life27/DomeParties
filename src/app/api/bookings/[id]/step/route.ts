import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// POST /api/bookings/[id]/step { step } — the booking page reports each screen
// a family reaches (0 Start .. 6 Pay) so the staff Overview can show exactly
// where people stop. Only ever moves forward. proxy.ts requires the booking's
// own token for this path, like every other /api/bookings/<id> route.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  const step = Number(body?.step)
  if (!Number.isInteger(step) || step < 0 || step > 6) {
    return NextResponse.json({ error: 'Invalid step' }, { status: 400 })
  }
  await prisma.booking.updateMany({ where: { id, furthestStep: { lt: step } }, data: { furthestStep: step } })
  return NextResponse.json({ ok: true })
}
