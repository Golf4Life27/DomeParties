import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const schema = z.object({
  name: z.string().min(1).optional(),
  tier: z.string().min(1).optional(),
  eventType: z.enum(['BIRTHDAY', 'GROUP', 'CORPORATE', 'LEAGUE', 'BACHELOR', 'OTHER']).optional(),
  description: z.string().optional(),
  includes: z.array(z.string()).optional(),
  durationMinutes: z.number().int().min(30).max(720).optional(),
  pricingType: z.enum(['PER_PERSON', 'FLAT']).optional(),
  pricePerPerson: z.number().int().min(0).optional(),
  flatPrice: z.number().int().min(0).optional(),
  minGuests: z.number().int().min(1).optional(),
  maxGuests: z.number().int().min(1).optional(),
  popular: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  const pkg = await prisma.package.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ package: pkg })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  // Bookings reference packages; deactivate instead of hard-deleting if referenced.
  const used = await prisma.booking.count({ where: { packageId: id } })
  if (used > 0) {
    await prisma.package.update({ where: { id }, data: { active: false } })
    return NextResponse.json({ ok: true, deactivated: true })
  }
  await prisma.package.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
