import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const schema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  price: z.number().int().min(0).optional(),
  unit: z.enum(['FLAT', 'PER_PERSON', 'PER_30_MIN']).optional(),
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
  const addOn = await prisma.addOn.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ addOn })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const used = await prisma.bookingAddOn.count({ where: { addOnId: id } })
  if (used > 0) {
    await prisma.addOn.update({ where: { id }, data: { active: false } })
    return NextResponse.json({ ok: true, deactivated: true })
  }
  await prisma.addOn.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
