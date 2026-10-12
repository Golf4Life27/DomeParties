import { cookies } from 'next/headers'
import { ADMIN_COOKIE, adminRoleFromCookie, type AdminRole } from '@/lib/auth'

// Server-component helper. Kept apart from @/lib/auth because next/headers
// cannot be imported into the edge middleware, and auth.ts has to stay usable
// there.

/** The staff role of the current request, or null when nobody is signed in. */
export async function currentAdminRole(): Promise<AdminRole | null> {
  return adminRoleFromCookie((await cookies()).get(ADMIN_COOKIE)?.value)
}
