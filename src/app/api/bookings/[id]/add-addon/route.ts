import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { addAddOnToConfirmed, BookingIncompleteError } from '@/lib/booking'

const schema = z.object({
  addOnId: z.string().min(1),
  quantity: z.number().int().min(1).max(50).default(1),
})

// POST /api/bookings/[id]/add-addon — post-booking upsell: add an extra to a
// confirmed booking; it lands on the balance due.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
  try {
    const result = await addAddOnToConfirmed(id, parsed.data.addOnId, parsed.data.quantity)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    if (e instanceof BookingIncompleteError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    console.error('add-addon failed', e)
    return NextResponse.json({ error: 'Could not add' }, { status: 500 })
  }
}
