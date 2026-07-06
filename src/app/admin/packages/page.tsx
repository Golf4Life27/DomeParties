import { prisma } from '@/lib/db'
import CatalogEditor, { type FieldDef } from '../CatalogEditor'

export const dynamic = 'force-dynamic'

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'tier', label: 'Tier (Good/Better/Best)' },
  {
    key: 'eventType',
    label: 'Event type',
    type: 'select',
    options: ['BIRTHDAY', 'GROUP', 'CORPORATE', 'LEAGUE', 'BACHELOR', 'OTHER'].map((v) => ({ value: v, label: v })),
  },
  { key: 'pricingType', label: 'Pricing', type: 'select', options: [{ value: 'BAY_RATE', label: 'Per-bay-hour (rate engine)' }, { value: 'PER_PERSON', label: 'Per person' }, { value: 'FLAT', label: 'Flat' }] },
  { key: 'bays', label: 'Bays (for per-bay-hour)', type: 'int' },
  { key: 'pricePerPerson', label: 'Price per person', type: 'money' },
  { key: 'flatPrice', label: 'Flat price', type: 'money' },
  { key: 'durationMinutes', label: 'Duration (minutes)', type: 'int' },
  { key: 'minGuests', label: 'Min guests', type: 'int' },
  { key: 'maxGuests', label: 'Max guests', type: 'int' },
  { key: 'sortOrder', label: 'Sort order', type: 'int' },
  { key: 'popular', label: 'Most popular', type: 'bool' },
  { key: 'active', label: 'Active', type: 'bool' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'includes', label: 'Includes (one per line)', type: 'stringlist' },
]

const BLANK = {
  name: '', tier: '2 Bays', eventType: 'BIRTHDAY', pricingType: 'BAY_RATE', bays: 2,
  pricePerPerson: 0, flatPrice: 0, durationMinutes: 120, minGuests: 1, maxGuests: 10,
  sortOrder: 0, popular: false, active: true, description: '', includes: [],
}

export default async function PackagesAdmin() {
  const packages = await prisma.package.findMany({ orderBy: { sortOrder: 'asc' } })
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Packages</h1>
      <p className="mt-1 text-foreground/60">Your party tiers. Flag one as “Most popular” to anchor it.</p>
      <CatalogEditor endpoint="/api/admin/packages" fields={FIELDS} items={packages} blank={BLANK} noun="package" />
    </div>
  )
}
