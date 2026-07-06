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
  return !!value && value === adminSessionToken()
}
