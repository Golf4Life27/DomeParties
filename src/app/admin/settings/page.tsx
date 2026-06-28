import { prisma } from '@/lib/db'
import SettingsForm from './SettingsForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } })
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Settings</h1>
      <p className="mt-1 text-foreground/60">
        Operating rules and money. Changes apply to new bookings immediately.
      </p>
      <SettingsForm setting={setting} />
    </div>
  )
}
