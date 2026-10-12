import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ADMIN_COOKIE, roleForPassword, sessionTokenForRole } from '@/lib/auth'

const schema = z.object({ password: z.string().min(1) })

// One login form, two passwords. The password typed decides the role, and the
// role decides which session token goes in the cookie — so Billy signs in at
// the same page as Alex and simply sees less.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Password required' }, { status: 400 })
  }
  const role = roleForPassword(parsed.data.password)
  if (!role) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true, role })
  res.cookies.set(ADMIN_COOKIE, sessionTokenForRole(role), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12, // 12h
  })
  return res
}

// Logout
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
