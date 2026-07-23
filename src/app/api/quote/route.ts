import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { computeQuote } from '@/lib/pricing'

const schema = z.object({
  partySize: z.number().int().min(1).max(300),
  fnbGuests: z.number().int().min(0).max(300).optional(),
  packageId: z.string().min(1),
  fnbPackageId: z.string().nullish(),
  addOns: z
    .array(z.object({ addOnId: z.string(), quantity: z.number().int().min(1).max(50) }))
    .default([]),
  dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  startMinutes: z.number().int().min(0).max(1439).nullish(),
})

// POST /api/quote — live, transparent price breakdown for current selections.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.issues }, { status: 400 })
  }
  try {
    const quote = await computeQuote(parsed.data)
    return NextResponse.json({ quote })
  } catch {
    return NextResponse.json({ error: 'Could not compute quote' }, { status: 400 })
  }
}
