import TrackmanImport from './TrackmanImport'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function TrackmanPage() {
  const openConflicts = await prisma.conflictAlert
    .count({ where: { resolvedAt: null } })
    .catch(() => 0)

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Trackman conflict check</h1>
      <p className="mt-1 max-w-2xl text-foreground/60">
        Since this system and Trackman share the same bays with no live link, paste Trackman&apos;s
        schedule for a day and we&apos;ll flag if the two together try to use more bays than the dome
        has. Do this before finalizing a big event, or any time you want to double-check.
      </p>
      {openConflicts > 0 && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-800 ring-1 ring-red-200">
          🔴 {openConflicts} open conflict{openConflicts === 1 ? '' : 's'} flagged across upcoming dates — re-check the affected days below.
        </p>
      )}
      <TrackmanImport />
    </div>
  )
}
