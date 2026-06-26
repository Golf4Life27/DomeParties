import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createDraft } from '@/lib/booking'

const schema = z.object({
  email: z.string().email(),
  eventType: z
    .enum(['BIRTHDAY', 'GROUP', 'CORPORATE', 'LEAGUE', 'BACHELOR', 'OTHER'])
    .default('BIRTHDAY'),
})

// POST /api/bookings — step 1 email capture; creates a DRAFT booking.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.issues }, { status: 400 })
  }
  const draft = await createDraft(parsed.data.email, parsed.data.eventType)
  return NextResponse.json(draft, { status: 201 })
}
