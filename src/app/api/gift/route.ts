import { NextResponse } from 'next/server'

/**
 * POST /api/gift — retired.
 *
 * The venue's real gift cards are sold through Trackman. This endpoint used to
 * mint a PENDING gift card and a payment intent for the in-app /gift page, which
 * is now redirected away in next.config.ts. Closing the endpoint too means a
 * stale open tab (or a script that remembers the URL) can't create a card the
 * front desk has never heard of.
 *
 * Deliberately left working elsewhere:
 *   - lib/giftcards confirmGiftPaid, still reached by the Stripe webhook, so any
 *     payment that was already in flight settles instead of stranding money.
 *   - /api/bookings/[id]/redeem-gift, so codes already issued still redeem.
 *   - /admin/gift-cards, so staff can see and manage what exists.
 */
export function POST() {
  return NextResponse.json(
    {
      error: 'Gift cards are no longer sold here.',
      buyAt: 'https://booking.trackmangolf.com/venues/whitetail/booking',
    },
    { status: 410 },
  )
}
