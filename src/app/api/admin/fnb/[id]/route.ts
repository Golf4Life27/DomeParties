import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const schema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  pricingType: z.enum(['PER_PERSON', 'FLAT']).optional(),
  price: z.number().int().min(0).optional(),
  dietaryNotes: z.string().nullish(),
  serviceCharge: z.boolean().optional(),
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
  const fnb = await prisma.fnbPackage.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ fnb })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const used = await prisma.booking.count({ where: { fnbPackageId: id } })
  if (used > 0) {
    await prisma.fnbPackage.update({ where: { id }, data: { active: false } })
    return NextResponse.json({ ok: true, deactivated: true })
  }
  await prisma.fnbPackage.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
