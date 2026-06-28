import { prisma } from '@/lib/db'
import CatalogEditor, { type FieldDef } from '../CatalogEditor'

export const dynamic = 'force-dynamic'

const FIELDS: FieldDef[] = [
  { key: 'label', label: 'Label' },
  { key: 'daysOfWeek', label: 'Days of week (0=Sun … 6=Sat)', type: 'intlist' },
  { key: 'minBays', label: 'Applies when bays ≥', type: 'int' },
  { key: 'ratePerHour', label: 'Rate per bay, per hour', type: 'money' },
  { key: 'startMinute', label: 'Start minute (0=midnight, 720=noon)', type: 'int' },
  { key: 'endMinute', label: 'End minute (1440=midnight)', type: 'int' },
  { key: 'sortOrder', label: 'Sort order', type: 'int' },
  { key: 'active', label: 'Active', type: 'bool' },
]

const BLANK = {
  label: '', daysOfWeek: [1, 2, 3, 4], minBays: 1, ratePerHour: 4500,
  startMinute: 0, endMinute: 1440, sortOrder: 0, active: true,
}

export default async function RatesAdmin() {
  const rates = await prisma.bayRate.findMany({ orderBy: { sortOrder: 'asc' } })
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Bay rates</h1>
      <p className="mt-1 max-w-2xl text-foreground/60">
        Per-bay, per-hour rates that power per-bay-hour packages. The most specific matching
        row wins (highest “bays ≥” tier), so you can drop the rate for larger groups and set
        higher weekend rates. Birthday packages compute automatically from these.
      </p>
      <CatalogEditor endpoint="/api/admin/rates" fields={FIELDS} items={rates} blank={BLANK} noun="rate" />
    </div>
  )
}
