import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createQuoteBookingFromLead } from '@/lib/booking'

const schema = z.object({
  total: z.number().int().min(100), // cents
  dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMinutes: z.number().int().min(0).max(1439),
  durationMinutes: z.number().int().min(30).max(720).default(180),
  partySize: z.number().int().min(1).max(1000),
  message: z.string().max(2000).optional().nullable(),
})

// POST /api/admin/leads/[id]/quote — create a PENDING quote booking + email pay link.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  try {
    const result = await createQuoteBookingFromLead(id, parsed.data)
    return NextResponse.json({
      ok: true,
      bookingId: result.booking.id,
      reference: result.booking.reference,
      payUrl: result.payUrl,
      baysAssigned: result.baysAssigned,
    })
  } catch (e) {
    console.error('quote creation failed', e)
    return NextResponse.json({ error: 'Could not create quote' }, { status: 500 })
  }
}
