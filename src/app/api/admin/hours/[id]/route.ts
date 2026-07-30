import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const dateish = z.string().optional().nullable().transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null))

const schema = z.object({
  label: z.string().min(1).optional(),
  kind: z.enum(['GOLF', 'PARTY']).optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
  closed: z.boolean().optional(),
  openMinute: z.coerce.number().int().min(0).max(1440).optional(),
  closeMinute: z.coerce.number().int().min(0).max(1440).optional(),
  validFrom: dateish.optional(),
  validTo: dateish.optional(),
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  const row = await prisma.operatingHours.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ row })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await prisma.operatingHours.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
