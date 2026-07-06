import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const schema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  category: z.string().default('Extras'),
  price: z.number().int().min(0).default(0),
  unit: z.enum(['FLAT', 'PER_PERSON', 'PER_30_MIN']).default('FLAT'),
  serviceCharge: z.boolean().default(false),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  const addOn = await prisma.addOn.create({ data: parsed.data })
  return NextResponse.json({ addOn }, { status: 201 })
}
