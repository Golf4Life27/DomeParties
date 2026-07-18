import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyApproval } from '@/lib/sign'
import { approveBooking, BookingConflictError, BookingIncompleteError } from '@/lib/booking'
import { minutesToLabel } from '@/lib/time'

// GET /api/staff/approve?bid=...&exp=...&sig=...
// One-tap approve from the staff notification email. Public path (email links
// can't carry the admin cookie) — authenticated by an expiring HMAC signature.
export async function GET(req: NextRequest) {
  const bid = req.nextUrl.searchParams.get('bid') ?? ''
  const exp = parseInt(req.nextUrl.searchParams.get('exp') ?? '0', 10)
  const sig = req.nextUrl.searchParams.get('sig') ?? ''
  if (!bid || !verifyApproval(bid, exp, sig)) {
    return page(400, 'Link invalid or expired', 'Open the admin dashboard to approve this booking.')
  }
  try {
    const b = await approveBooking(bid)
    const booking = await prisma.booking.findUnique({
      where: { id: b.id },
      include: { resources: { include: { resource: true } } },
    })
    const bays = booking?.resources.map((r) => r.resource.name).join(', ') || '—'
    return page(
      200,
      `${b.reference} confirmed ✓`,
      `${b.customerName ?? 'Guest'} · ${b.date.toISOString().slice(0, 10)} · ${minutesToLabel(b.startMinutes)}–${minutesToLabel(b.endMinutes)}<br/>Bays: <strong>${bays}</strong> — block these in Trackman.<br/><br/>The guest just received their confirmation email.`,
    )
  } catch (e) {
    if (e instanceof BookingConflictError || e instanceof BookingIncompleteError) {
      return page(409, 'Could not approve', e.message)
    }
    console.error('one-tap approve failed', e)
    return page(500, 'Something went wrong', 'Try again from the admin dashboard.')
  }
}

function page(status: number, title: string, body: string) {
  const ok = status === 200
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:system-ui,Arial,sans-serif;background:#0a102e;color:#e9edfb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="max-width:420px;padding:32px;text-align:center">
<div style="font-size:56px">${ok ? '✅' : '⚠️'}</div>
<h1 style="color:${ok ? '#c8ff2e' : '#fbbf24'}">${title}</h1>
<p style="line-height:1.6">${body}</p>
</div></body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}
