// Minimal admin auth: a shared password grants an httpOnly session cookie whose
// value must equal a known session token. Edge-middleware-safe (string compare
// only). Clearly upgradeable to real auth (e.g. Supabase Auth) later.
//
// Two roles share the one cookie. Which password was typed decides which token
// is minted, and the token found in the cookie decides the role on every
// request — never a header, which the browser could set itself.
//
//   admin        Alex. Everything.
//   coordinator  Billy. Leads, bookings, the day sheet, Trackman checks and the
//                annual-accounts tracker: the work of running events. Not
//                pricing, settings, promos, gift cards, Stripe refunds, or
//                anything that reseeds data.
//
// What each role may open lives in @/lib/access so proxy.ts and the admin
// layout read one list.

export const ADMIN_COOKIE = 'dome_admin'

export type AdminRole = 'admin' | 'coordinator'

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'dome-admin'
}

export function adminSessionToken(): string {
  return process.env.ADMIN_SESSION_TOKEN || 'dev-admin-session-token-change-me'
}

export function coordinatorPassword(): string {
  return process.env.COORDINATOR_PASSWORD || 'dome-coordinator'
}

export function coordinatorSessionToken(): string {
  return process.env.COORDINATOR_SESSION_TOKEN || 'dev-coordinator-session-token-change-me'
}

// Fail closed in production if a role's secrets were never configured — the
// defaults above are public in the repo and must never authenticate a live
// site. Each role is judged on its own pair: leaving the coordinator secrets
// unset simply switches that role off without touching the admin login.
function adminConfigured(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    !!(process.env.ADMIN_SESSION_TOKEN && process.env.ADMIN_PASSWORD)
  )
}

function coordinatorConfigured(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    !!(process.env.COORDINATOR_SESSION_TOKEN && process.env.COORDINATOR_PASSWORD)
  )
}

/** The role a session cookie value carries, or null when it is not a session at all. */
export function adminRoleFromCookie(value: string | undefined): AdminRole | null {
  if (!value) return null
  if (adminConfigured() && value === adminSessionToken()) return 'admin'
  if (coordinatorConfigured() && value === coordinatorSessionToken()) return 'coordinator'
  return null
}

/** The role a typed password unlocks, or null. The login route is its only caller. */
export function roleForPassword(password: string): AdminRole | null {
  if (adminConfigured() && password === adminPassword()) return 'admin'
  if (coordinatorConfigured() && password === coordinatorPassword()) return 'coordinator'
  return null
}

export function sessionTokenForRole(role: AdminRole): string {
  return role === 'admin' ? adminSessionToken() : coordinatorSessionToken()
}

/** True for any staff session, whichever role. */
export function isValidAdminCookie(value: string | undefined): boolean {
  return adminRoleFromCookie(value) !== null
}

type CookieReader = { cookies: { get(name: string): { value: string } | undefined } }

/** True when the request carries a valid staff session cookie of either role. */
export function isAdminRequest(req: CookieReader): boolean {
  return isValidAdminCookie(req.cookies.get(ADMIN_COOKIE)?.value)
}

/** The role on a request, read from its cookie. */
export function adminRoleOf(req: CookieReader): AdminRole | null {
  return adminRoleFromCookie(req.cookies.get(ADMIN_COOKIE)?.value)
}
