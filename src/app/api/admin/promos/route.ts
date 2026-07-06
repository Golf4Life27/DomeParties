import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const dateStr = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use YYYY-MM-DD or leave blank')
  .transform((v) => (v === '' ? null : new Date(`${v}T00:00:00.000Z`)))

const promoSchema = z.object({
  code: z.string().min(2).max(40).transform((v) => v.trim().toUpperCase()),
  description: z.string().default(''),
  percentOff: z.number().int().min(0).max(100).default(0),
  amountOff: z.number().int().min(0).default(0),
  minTotal: z.number().int().min(0).default(0),
  appliesDays: z.array(z.number().int().min(0).max(6)).default([]),
  startsAt: dateStr.nullish().default(null),
  endsAt: dateStr.nullish().default(null),
  maxRedemptions: z.number().int().min(0).default(0),
  featuredInRecovery: z.boolean().default(false),
  active: z.boolean().default(true),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = promoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  const promo = await prisma.promoCode.create({ data: parsed.data })
  return NextResponse.json({ promo }, { status: 201 })
}
