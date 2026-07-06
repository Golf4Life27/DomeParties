import { NextRequest, NextResponse } from 'next/server'
import { approveBooking, BookingIncompleteError } from '@/lib/booking'

// POST /api/admin/bookings/[id]/approve — staff confirm a deposit-paid booking
// that was held for review (shared bays). Sends the final confirmation + invite.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const b = await approveBooking(id)
    return NextResponse.json({ ok: true, status: b.status })
  } catch (e) {
    if (e instanceof BookingIncompleteError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    console.error('approve failed', e)
    return NextResponse.json({ error: 'Approve failed' }, { status: 500 })
  }
}
