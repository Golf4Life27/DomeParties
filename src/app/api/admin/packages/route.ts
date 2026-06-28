import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const schema = z.object({
  name: z.string().min(1),
  tier: z.string().min(1),
  eventType: z.enum(['BIRTHDAY', 'GROUP', 'CORPORATE', 'LEAGUE', 'BACHELOR', 'OTHER']).default('BIRTHDAY'),
  description: z.string().default(''),
  includes: z.array(z.string()).default([]),
  durationMinutes: z.number().int().min(30).max(720).default(120),
  pricingType: z.enum(['PER_PERSON', 'FLAT']).default('PER_PERSON'),
  pricePerPerson: z.number().int().min(0).default(0),
  flatPrice: z.number().int().min(0).default(0),
  minGuests: z.number().int().min(1).default(1),
  maxGuests: z.number().int().min(1).default(180),
  popular: z.boolean().default(false),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  const pkg = await prisma.package.create({ data: parsed.data })
  return NextResponse.json({ package: pkg }, { status: 201 })
}
