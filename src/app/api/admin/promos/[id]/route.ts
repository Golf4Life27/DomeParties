import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const dateStr = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use YYYY-MM-DD or leave blank')
  .transform((v) => (v === '' ? null : new Date(`${v}T00:00:00.000Z`)))

const schema = z.object({
  code: z.string().min(2).max(40).transform((v) => v.trim().toUpperCase()).optional(),
  description: z.string().optional(),
  percentOff: z.number().int().min(0).max(100).optional(),
  amountOff: z.number().int().min(0).optional(),
  minTotal: z.number().int().min(0).optional(),
  appliesDays: z.array(z.number().int().min(0).max(6)).optional(),
  startsAt: dateStr.nullish(),
  endsAt: dateStr.nullish(),
  maxRedemptions: z.number().int().min(0).optional(),
  featuredInRecovery: z.boolean().optional(),
  active: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  // strip undefined keys so partial updates don't null things out
  const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined))
  const promo = await prisma.promoCode.update({ where: { id }, data })
  return NextResponse.json({ promo })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await prisma.promoCode.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
