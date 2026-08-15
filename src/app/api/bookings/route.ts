import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createDraft } from '@/lib/booking'
import { bookingCookieName, bookingToken } from '@/lib/sign'
import { readAttribution } from '@/lib/attribution'

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
  const draft = await createDraft(parsed.data.email, parsed.data.eventType, readAttribution(req))

  // Hand the browser that created this booking its access cookie. Everything the
  // rest of checkout calls — PATCH, checkout, pay, promo, gift card, confirmation
  // — is gated on the booking token in src/proxy.ts, and this is what authorizes
  // the flow without the client ever having to hold or forward the token itself.
  const res = NextResponse.json(draft, { status: 201 })
  res.cookies.set(bookingCookieName(draft.id), bookingToken(draft.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
