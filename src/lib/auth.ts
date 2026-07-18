// Minimal admin auth: a shared password grants a signed httpOnly session cookie
// whose value must equal ADMIN_SESSION_TOKEN. Edge-middleware-safe (string
// compare only). Clearly upgradeable to real auth (e.g. Supabase Auth) later.

export const ADMIN_COOKIE = 'dome_admin'

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'dome-admin'
}

export function adminSessionToken(): string {
  return process.env.ADMIN_SESSION_TOKEN || 'dev-admin-session-token-change-me'
}

export function isValidAdminCookie(value: string | undefined): boolean {
  // Fail closed in production if the secrets were never configured — the
  // defaults are public in the repo and must never authenticate a live site.
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.ADMIN_SESSION_TOKEN || !process.env.ADMIN_PASSWORD)
  ) {
    return false
  }
  return !!value && value === adminSessionToken()
}

/** True when the request carries a valid admin session cookie. */
export function isAdminRequest(req: { cookies: { get(name: string): { value: string } | undefined } }): boolean {
  return isValidAdminCookie(req.cookies.get(ADMIN_COOKIE)?.value)
}
