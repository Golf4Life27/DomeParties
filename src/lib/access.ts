import type { AdminRole } from '@/lib/auth'

// What each staff role may open. proxy.ts enforces this on every /admin and
// /api/admin request; the admin layout reads the same list to hide links that
// would only ever land on a 403. Edge-safe: pure string checks, no imports
// beyond a type.
//
// The coordinator entries are an ALLOWLIST. A page or API route added later is
// admin-only until someone decides otherwise — the safe default for anything
// that might turn out to touch money or configuration.

// Matched exactly. '/admin' is the overview and must NOT act as a prefix, or it
// would admit everything beneath it.
const COORDINATOR_EXACT: readonly string[] = ['/admin', '/admin/login', '/api/admin/login']

// Matched as the path itself or anything beneath it.
const COORDINATOR_PREFIXES: readonly string[] = [
  '/admin/day',
  '/admin/trackman',
  '/admin/bookings',
  '/admin/leads',
  '/admin/accounts',
  // approve, complete, reschedule, recover, mark-balance-paid, and cancel —
  // the cancel route itself refuses the refund flag for this role.
  '/api/admin/bookings',
  '/api/admin/leads',
  '/api/admin/trackman',
  '/api/admin/accounts',
]

/** True when `pathname` is `prefix` itself or a path beneath it. */
function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

export function canAccess(role: AdminRole, pathname: string): boolean {
  if (role === 'admin') return true
  if (COORDINATOR_EXACT.includes(pathname)) return true
  return COORDINATOR_PREFIXES.some((p) => under(pathname, p))
}
