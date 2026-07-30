import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const dateish = z.string().optional().nullable().transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null))

const schema = z.object({
  label: z.string().min(1),
  kind: z.enum(['GOLF', 'PARTY']),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  closed: z.boolean().default(false),
  openMinute: z.coerce.number().int().min(0).max(1440).default(540),
  closeMinute: z.coerce.number().int().min(0).max(1440).default(1320),
  validFrom: dateish,
  validTo: dateish,
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  const row = await prisma.operatingHours.create({ data: parsed.data })
  return NextResponse.json({ row }, { status: 201 })
}
