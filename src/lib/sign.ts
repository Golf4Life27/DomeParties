// HMAC-signed, expiring action links (e.g. one-tap approve from a staff email).
// Keyed off ADMIN_SESSION_TOKEN so no new secret is needed.
import { createHmac, timingSafeEqual } from 'node:crypto'

function key(): string {
  const token = process.env.ADMIN_SESSION_TOKEN
  // Fail closed, the same way auth.ts and the cron route already do. The
  // fallback below is published in this repo, so signing with it in production
  // would let anyone compute the calendar-feed key, the staff-calendar key, and
  // forge one-tap approval links for any booking — bypassing the whole
  // double-booking review queue from the open internet. This also catches the
  // subtler case: the variable set on Production but missing from the Preview
  // scope that serves preview URLs.
  if (process.env.NODE_ENV === 'production' && !token) {
    throw new Error(
      'ADMIN_SESSION_TOKEN is not set. Refusing to sign links with the public development key.',
    )
  }
  return token || 'dev-admin-session-token-change-me'
}

function hmac(payload: string): string {
  return createHmac('sha256', key()).update(payload).digest('hex')
}

/** Signed approve-link params for a booking, valid for `days` (default 14). */
export function signApproval(bookingId: string, days = 14): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + days * 86_400
  return { exp, sig: hmac(`approve:${bookingId}:${exp}`) }
}

export function verifyApproval(bookingId: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false
  const expected = hmac(`approve:${bookingId}:${exp}`)
  const a = Buffer.from(expected)
  const b = Buffer.from(sig)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Per-booking access token for guest links (manage, balance, pay, confirmation)
 * and every /api/bookings/<id> route.
 *
 * Derived by HMAC rather than stored, so there's no column, no migration, and no
 * backfill — and it rotates with ADMIN_SESSION_TOKEN like every other key here.
 *
 * The hole this closes: a booking id alone used to be full access. Ids are handed
 * out deliberately — /invite/<id> is the link the host forwards to their guests —
 * so every invited parent held the key to the host's phone number, email, waiver
 * signature and Stripe payment reference, and could add paid extras to the party.
 */
export function bookingToken(bookingId: string): string {
  return hmac(`booking:${bookingId}`).slice(0, 32)
}

export function verifyBookingToken(bookingId: string, token: string | undefined): boolean {
  if (!bookingId) return false
  return keyMatches(token, bookingToken(bookingId))
}

/**
 * Cookie that remembers a verified token. Set once — when a booking is created,
 * or when a guest opens an emailed link carrying ?t= — so the fetches those pages
 * make afterwards are authorized without every call site having to carry it.
 */
export function bookingCookieName(bookingId: string): string {
  return `bt_${bookingId}`
}

/** Static signed key for the read-only calendar feed URL. */
export function calendarFeedKey(): string {
  return hmac('calendar-feed').slice(0, 32)
}

/**
 * Static signed key for the shared read-only staff calendar page. Separate from
 * the .ics feed key so one can be rotated without breaking the other.
 */
export function staffCalendarKey(): string {
  return hmac('staff-calendar').slice(0, 32)
}

/** Constant-time compare for the static share keys. */
export function keyMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
