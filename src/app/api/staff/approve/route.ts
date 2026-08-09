import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyApproval } from '@/lib/sign'
import { approveBooking, BookingConflictError, BookingIncompleteError } from '@/lib/booking'
import { minutesToLabel } from '@/lib/time'

// One-tap approve from the staff notification email. Public path (email links
// can't carry the admin cookie) — authenticated by an expiring HMAC signature.
//
// GET only ever SHOWS the booking and a button. Approving is a POST.
//
// This used to approve on GET, and a live booking confirmed itself: the review
// email went out, nobody touched Approve, and the booking was CONFIRMED by the
// time staff opened the admin page. Mail providers, link scanners and antivirus
// fetch the URLs in a message before a human sees it — so a GET that mutates is
// a GET that fires itself, and the whole point of this link is that a person
// checked Trackman first. Prefetchers don't POST.

export async function GET(req: NextRequest) {
  const { bid, exp, sig, ok } = params(req)
  if (!ok) return page(400, 'Link invalid or expired', 'Open the admin dashboard to approve this booking.')

  const booking = await prisma.booking.findUnique({
    where: { id: bid },
    include: { resources: { include: { resource: true } } },
  })
  if (!booking) return page(404, 'Booking not found', 'It may have been deleted. Check the admin dashboard.')

  if (booking.status === 'CONFIRMED') {
    return page(200, `${esc(booking.reference)} already confirmed`, 'Nothing to do — this one is already approved.')
  }
  if (booking.status === 'CANCELLED') {
    return page(409, `${esc(booking.reference)} was cancelled`, 'A cancelled booking can’t be approved.')
  }

  const bays = booking.resources.map((r) => r.resource.name).join(', ') || 'none assigned'
  const action = `/api/staff/approve?bid=${encodeURIComponent(bid)}&exp=${exp}&sig=${encodeURIComponent(sig)}`

  return page(
    200,
    `Approve ${esc(booking.reference)}?`,
    `${esc(booking.customerName ?? 'Guest')} · ${booking.date.toISOString().slice(0, 10)}<br/>
     ${minutesToLabel(booking.startMinutes)}–${minutesToLabel(booking.endMinutes)} · ${booking.partySize} guests
     <p style="margin:24px 0 8px">Bays held: <strong>${esc(bays)}</strong></p>
     <p style="margin:0;opacity:.8">Check Trackman for conflicts on those bays first — approving confirms the
     booking and emails the guest.</p>
     <form method="post" action="${esc(action)}" style="margin-top:28px">
       <button type="submit" style="background:#c8ff2e;color:#0e1740;border:0;border-radius:999px;padding:14px 28px;font-size:16px;font-weight:700;cursor:pointer">
         Approve booking ✓
       </button>
     </form>`,
    { icon: '🛠️', color: '#c8ff2e' },
  )
}

export async function POST(req: NextRequest) {
  const { bid, ok } = params(req)
  if (!ok) return page(400, 'Link invalid or expired', 'Open the admin dashboard to approve this booking.')

  try {
    const b = await approveBooking(bid)
    const booking = await prisma.booking.findUnique({
      where: { id: b.id },
      include: { resources: { include: { resource: true } } },
    })
    const bays = booking?.resources.map((r) => r.resource.name).join(', ') || '—'
    return page(
      200,
      `${esc(b.reference)} confirmed ✓`,
      `${esc(b.customerName ?? 'Guest')} · ${b.date.toISOString().slice(0, 10)} · ${minutesToLabel(b.startMinutes)}–${minutesToLabel(b.endMinutes)}<br/>
       Bays: <strong>${esc(bays)}</strong> — block these in Trackman.<br/><br/>
       The guest just received their confirmation email.`,
    )
  } catch (e) {
    if (e instanceof BookingConflictError || e instanceof BookingIncompleteError) {
      return page(409, 'Could not approve', esc(e.message))
    }
    console.error('one-tap approve failed', e)
    return page(500, 'Something went wrong', 'Try again from the admin dashboard.')
  }
}

function params(req: NextRequest) {
  const bid = req.nextUrl.searchParams.get('bid') ?? ''
  const exp = parseInt(req.nextUrl.searchParams.get('exp') ?? '0', 10)
  const sig = req.nextUrl.searchParams.get('sig') ?? ''
  return { bid, exp, sig, ok: Boolean(bid) && verifyApproval(bid, exp, sig) }
}

/** Guest-supplied names land in this HTML, so escape everything interpolated. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function page(status: number, title: string, body: string, opts?: { icon?: string; color?: string }) {
  const ok = status === 200
  const icon = opts?.icon ?? (ok ? '✅' : '⚠️')
  const color = opts?.color ?? (ok ? '#c8ff2e' : '#fbbf24')
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:system-ui,Arial,sans-serif;background:#0a102e;color:#e9edfb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="max-width:420px;padding:32px;text-align:center">
<div style="font-size:56px">${icon}</div>
<h1 style="color:${color}">${title}</h1>
<p style="line-height:1.6">${body}</p>
</div></body>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Never let a proxy or mail scanner cache an action page.
        'Cache-Control': 'no-store',
      },
    },
  )
}
