import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createGiftPurchase, createGiftPaymentIntent } from '@/lib/giftcards'

const schema = z.object({
  amount: z.number().int().min(1000).max(500000), // $10–$5,000
  purchaserName: z.string().max(120).optional(),
  purchaserEmail: z.string().email(),
  recipientName: z.string().max(120).optional(),
  recipientEmail: z.string().email(),
  message: z.string().max(500).optional(),
})

// POST /api/gift — create a PENDING gift card and return payment info.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  const gift = await createGiftPurchase(parsed.data)
  const payment = await createGiftPaymentIntent(gift.id)
  return NextResponse.json({ giftId: gift.id, payment })
}
