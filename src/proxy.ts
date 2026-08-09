import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, isValidAdminCookie } from '@/lib/auth'
import { bookingCookieName, verifyBookingToken } from '@/lib/sign'
import { VENUE } from '@/lib/venue'

// Two gates, both here on purpose.
//
// 1. /admin and /api/admin need a staff session.
//
// 2. Everything addressed by a booking id needs that booking's token. This used
//    to be wide open: GET /api/bookings/<id> returned the whole record — name,
//    email, phone, private notes, the waiver signature, the Stripe payment intent
//    — and the sub-routes would apply promos, redeem gift cards or add paid extras
//    to a stranger's party. Ids are not secret by accident, they are shared on
//    purpose: /invite/<id> is the link a host forwards to every guest, so the
//    whole invite list held the key to the host's record.
//
// The gate lives in one file rather than in each of the ten booking routes so a
// route added later is protected by default instead of protected if remembered.
//
// Note /invite/<id> is deliberately NOT gated. It is meant to be public and its
// page only ever renders the host's first name, the date, the time and the venue
// address — it reads the booking server-side and never exposes the record.

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days — comfortably past any event

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    return adminGate(req)
  }
  return bookingGate(req)
}

function adminGate(req: NextRequest) {
  const { pathname } = req.nextUrl
  // The login page and login API must stay public or nobody can ever sign in.
  if (pathname === '/admin/login' || pathname === '/api/admin/login') {
    return NextResponse.next()
  }
  if (isValidAdminCookie(req.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/admin/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

function bookingGate(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Creating a booking has no id to check yet; that route mints the cookie.
  if (pathname === '/api/bookings') return NextResponse.next()

  // Abandoned-cart recovery lands on /book?draft=<id>&t=<token>. Mint the cookie
  // so the resume fetch is authorized, but never deny — /book itself is public.
  if (pathname === '/book') {
    const draft = req.nextUrl.searchParams.get('draft')
    const t = req.nextUrl.searchParams.get('t') ?? undefined
    if (draft && verifyBookingToken(draft, t)) return allow(draft, t!)
    return NextResponse.next()
  }

  const id = bookingIdFrom(pathname)
  if (!id) return NextResponse.next()

  // Staff with a live session get through untouched — they legitimately open
  // guest pages when helping someone over the phone.
  if (isValidAdminCookie(req.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next()

  const fromQuery = req.nextUrl.searchParams.get('t') ?? undefined
  // Remember a verified token, so the fetches this page makes next (pay, add-on,
  // refresh) are authorized without threading it through every call site.
  if (verifyBookingToken(id, fromQuery)) return allow(id, fromQuery!)

  const fromHeader = req.headers.get('x-booking-token') ?? undefined
  const fromCookie = req.cookies.get(bookingCookieName(id))?.value
  if (verifyBookingToken(id, fromHeader) || verifyBookingToken(id, fromCookie)) {
    return NextResponse.next()
  }

  return deny(pathname.startsWith('/api/'))
}

/** The booking id in each gated path shape, or null when there isn't one. */
function bookingIdFrom(pathname: string): string | null {
  const seg = pathname.split('/').filter(Boolean)
  if (seg[0] === 'api' && seg[1] === 'bookings') return seg[2] ?? null
  if (seg[0] === 'book' && seg[1] === 'confirmation') return seg[2] ?? null
  if (seg[0] === 'manage' || seg[0] === 'balance' || seg[0] === 'pay') return seg[1] ?? null
  return null
}

/** Pass the request through, remembering the verified token for this booking. */
function allow(bookingId: string, token: string) {
  const res = NextResponse.next()
  res.cookies.set(bookingCookieName(bookingId), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
  return res
}

function deny(isApi: boolean) {
  if (isApi) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Link not valid</title>
<body style="font-family:system-ui,Arial,sans-serif;background:#0a102e;color:#e9edfb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="max-width:420px;padding:32px;text-align:center">
<div style="font-size:56px">🔒</div>
<h1 style="color:#fbbf24">This link isn&rsquo;t valid</h1>
<p style="line-height:1.6">Booking links are personal and expire if edited or truncated.
Open the most recent email we sent you, or call us on
<a href="tel:${VENUE.phoneDigits}" style="color:#c8ff2e;font-weight:600">${VENUE.phone}</a>
and we&rsquo;ll sort it out.</p>
</div></body>`,
    {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    },
  )
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/bookings/:path*',
    '/book',
    '/manage/:path*',
    '/balance/:path*',
    '/pay/:path*',
    '/book/confirmation/:path*',
  ],
}
