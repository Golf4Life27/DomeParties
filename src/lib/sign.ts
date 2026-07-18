// HMAC-signed, expiring action links (e.g. one-tap approve from a staff email).
// Keyed off ADMIN_SESSION_TOKEN so no new secret is needed.
import { createHmac, timingSafeEqual } from 'node:crypto'

function key(): string {
  return process.env.ADMIN_SESSION_TOKEN || 'dev-admin-session-token-change-me'
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

/** Static signed key for the read-only calendar feed URL. */
export function calendarFeedKey(): string {
  return hmac('calendar-feed').slice(0, 32)
}
