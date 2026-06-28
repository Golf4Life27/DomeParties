import Link from 'next/link'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE, isValidAdminCookie } from '@/lib/auth'
import LogoutButton from './LogoutButton'

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/leads', label: 'Leads' },
  { href: '/admin/packages', label: 'Packages' },
  { href: '/admin/fnb', label: 'Food & drink' },
  { href: '/admin/addons', label: 'Add-ons' },
  { href: '/admin/gift-cards', label: 'Gift cards' },
  { href: '/admin/settings', label: 'Settings' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookie = (await cookies()).get(ADMIN_COOKIE)?.value
  const authed = isValidAdminCookie(cookie)

  // Unauthenticated (e.g. the login page) renders without admin chrome.
  if (!authed) return <>{children}</>

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-brand-dark text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Link href="/admin" className="font-bold">
            Dome Admin
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/80">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-white">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <Link href="/" className="text-white/70 hover:text-white">
              View site ↗
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  )
}
