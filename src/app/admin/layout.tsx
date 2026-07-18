import Link from 'next/link'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE, isValidAdminCookie } from '@/lib/auth'
import { prisma } from '@/lib/db'
import LogoutButton from './LogoutButton'

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/day', label: 'Day view' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/leads', label: 'Leads' },
  { href: '/admin/bays', label: 'Bays' },
  { href: '/admin/packages', label: 'Packages' },
  { href: '/admin/rates', label: 'Bay rates' },
  { href: '/admin/fnb', label: 'Food & drink' },
  { href: '/admin/addons', label: 'Add-ons' },
  { href: '/admin/gift-cards', label: 'Gift cards' },
  { href: '/admin/promos', label: 'Promos' },
  { href: '/admin/embed', label: 'Embed' },
  { href: '/admin/settings', label: 'Settings' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookie = (await cookies()).get(ADMIN_COOKIE)?.value
  const authed = isValidAdminCookie(cookie)

  // Unauthenticated (e.g. the login page) renders without admin chrome.
  if (!authed) return <div className="admin-light flex min-h-screen flex-col">{children}</div>

  // Surface silent-failure states loudly: email off = no confirmations, no
  // staff alerts, no reminders — invisible unless someone says so here.
  const warnings: string[] = []
  if (!process.env.RESEND_API_KEY) {
    warnings.push(
      'Emails are NOT being sent (no RESEND_API_KEY). Customers get no confirmations and you get no alerts — everything logs to the server console only.',
    )
  }
  const setting = await prisma.setting.findUnique({ where: { id: 1 } }).catch(() => null)
  if (setting && !setting.staffNotifyEmail) {
    warnings.push('No staff notification email is set (Settings) — you will not be alerted about new bookings.')
  }
  if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_WEBHOOK_SECRET) {
    warnings.push(
      'STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is missing — cards would be charged but bookings would NEVER confirm. Fix before taking payments.',
    )
  }
  if (!process.env.CRON_SECRET) {
    warnings.push('CRON_SECRET is not set — scheduled jobs (reminders, recovery, balance chasing) are disabled.')
  }

  return (
    <div className="admin-light flex min-h-screen flex-col">
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
      {warnings.length > 0 && (
        <div className="bg-red-600 text-white">
          <div className="mx-auto max-w-6xl space-y-1 px-6 py-2 text-sm font-medium">
            {warnings.map((w) => (
              <p key={w}>⚠ {w}</p>
            ))}
          </div>
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  )
}
