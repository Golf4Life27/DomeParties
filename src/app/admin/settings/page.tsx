import { prisma } from '@/lib/db'
import SettingsForm from './SettingsForm'
import SeedButton from './SeedButton'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const setting = await prisma.setting.findUnique({ where: { id: 1 } })
  const packageCount = await prisma.package.count().catch(() => 0)
  if (!setting) {
    // Fresh database (migrated but not seeded): offer the one-click load.
    return (
      <div>
        <h1 className="text-2xl font-bold text-brand-dark">Settings</h1>
        <p className="mt-1 text-foreground/60">Welcome! Load the catalog to get started.</p>
        <SeedButton hasCatalog={false} />
      </div>
    )
  }
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Settings</h1>
      <p className="mt-1 text-foreground/60">
        Operating rules and money. Changes apply to new bookings immediately.
      </p>
      <SettingsForm setting={setting} />
      <SeedButton hasCatalog={packageCount > 0} />
    </div>
  )
}
