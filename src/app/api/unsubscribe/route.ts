import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyBookingToken } from '@/lib/sign'
import { unsubscribeDraftsFor } from '@/lib/recovery'

// POST /api/unsubscribe — from the button on /unsubscribe. Stops unfinished-
// booking reminders for every draft on that booking's email address. The
// booking's own signed token proves the request came from the emailed link.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const b = String(form?.get('b') ?? '')
  const t = String(form?.get('t') ?? '')
  const back = (q: string) => NextResponse.redirect(new URL(`/unsubscribe?${q}`, req.url), 303)
  if (!b || !verifyBookingToken(b, t)) return back('bad=1')
  const booking = await prisma.booking.findUnique({ where: { id: b }, select: { customerEmail: true } })
  if (!booking?.customerEmail) return back('bad=1')
  await unsubscribeDraftsFor(booking.customerEmail)
  return back('done=1')
}
