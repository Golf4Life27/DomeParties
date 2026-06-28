import { NextRequest, NextResponse } from 'next/server'
import {
  placeHold,
  BookingConflictError,
  BookingIncompleteError,
} from '@/lib/booking'

// POST /api/bookings/[id]/checkout
// Places an authoritative hold (assigns bays, locks pricing). Payment (and any
// gift-card redemption) happens next via /redeem-gift + /pay.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const { booking, quote } = await placeHold(id)
    return NextResponse.json({
      reference: booking.reference,
      depositAmount: quote.depositAmount,
      total: quote.total,
      balanceDue: quote.balanceDue,
    })
  } catch (e) {
    if (e instanceof BookingConflictError) {
      return NextResponse.json({ error: e.message, code: 'CONFLICT' }, { status: 409 })
    }
    if (e instanceof BookingIncompleteError) {
      return NextResponse.json({ error: e.message, code: 'INCOMPLETE' }, { status: 400 })
    }
    console.error('checkout error', e)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
