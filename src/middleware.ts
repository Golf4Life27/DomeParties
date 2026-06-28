import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, isValidAdminCookie } from '@/lib/auth'

// Protect /admin (pages) and /api/admin (mutations). The login page and login
// API are public so an unauthenticated user can sign in.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isLoginPage = pathname === '/admin/login'
  const isLoginApi = pathname === '/api/admin/login'
  if (isLoginPage || isLoginApi) return NextResponse.next()

  const cookie = req.cookies.get(ADMIN_COOKIE)?.value
  if (isValidAdminCookie(cookie)) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/admin/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
