import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const schema = z.object({
  label: z.string().min(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  startMinute: z.number().int().min(0).max(1440).default(0),
  endMinute: z.number().int().min(0).max(1440).default(1440),
  minBays: z.number().int().min(1).max(30).default(1),
  ratePerHour: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  const rate = await prisma.bayRate.create({ data: parsed.data })
  return NextResponse.json({ rate }, { status: 201 })
}
