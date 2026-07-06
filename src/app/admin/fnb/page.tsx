import { prisma } from '@/lib/db'
import CatalogEditor, { type FieldDef } from '../CatalogEditor'

export const dynamic = 'force-dynamic'

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'pricingType', label: 'Pricing', type: 'select', options: [{ value: 'PER_PERSON', label: 'Per person' }, { value: 'FLAT', label: 'Flat / platter' }] },
  { key: 'price', label: 'Price', type: 'money' },
  { key: 'sortOrder', label: 'Sort order', type: 'int' },
  { key: 'serviceCharge', label: 'Service charge applies', type: 'bool' },
  { key: 'active', label: 'Active', type: 'bool' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'dietaryNotes', label: 'Dietary notes', type: 'text', full: true },
]

const BLANK = {
  name: '', pricingType: 'PER_PERSON', price: 0, sortOrder: 0,
  serviceCharge: true, active: true, description: '', dietaryNotes: '',
}

export default async function FnbAdmin() {
  const fnb = await prisma.fnbPackage.findMany({ orderBy: { sortOrder: 'asc' } })
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Food &amp; drink</h1>
      <p className="mt-1 text-foreground/60">Per-person or platter F&amp;B packages shown in the booking flow.</p>
      <CatalogEditor endpoint="/api/admin/fnb" fields={FIELDS} items={fnb} blank={BLANK} noun="F&B package" />
    </div>
  )
}
