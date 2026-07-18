import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const schema = z.object({
  label: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  startMinute: z.number().int().min(0).max(1440).optional(),
  endMinute: z.number().int().min(0).max(1440).optional(),
  minBays: z.number().int().min(1).max(30).optional(),
  minHours: z.number().int().min(0).max(24).optional(),
  ratePerHour: z.number().int().min(0).optional(),
  flatPerBay: z.number().int().min(0).optional(),
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
  const rate = await prisma.bayRate.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ rate })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await prisma.bayRate.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
