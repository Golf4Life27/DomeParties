import { prisma } from '@/lib/db'
import CatalogEditor, { type FieldDef } from '../CatalogEditor'

export const dynamic = 'force-dynamic'

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'category', label: 'Category (Beverages/Food/Time/Experience/Décor/Extras)' },
  { key: 'unit', label: 'Unit', type: 'select', options: [
    { value: 'FLAT', label: 'Flat' },
    { value: 'PER_PERSON', label: 'Per person' },
    { value: 'PER_30_MIN', label: 'Per 30 min' },
  ] },
  { key: 'price', label: 'Price', type: 'money' },
  { key: 'sortOrder', label: 'Sort order', type: 'int' },
  { key: 'serviceCharge', label: 'Service charge applies', type: 'bool' },
  { key: 'choiceCount', label: 'Customer picks how many (0 = no menu)', type: 'int' },
  { key: 'choiceList', label: 'Choice menu (one per line)', type: 'stringlist' },
  { key: 'active', label: 'Active', type: 'bool' },
  { key: 'description', label: 'Description', type: 'textarea' },
]

const BLANK = {
  name: '', category: 'Extras', unit: 'FLAT', price: 0,
  sortOrder: 0, serviceCharge: false, active: true, description: '',
  choiceCount: 0, choiceList: [],
}

export default async function AddonsAdmin() {
  const addOns = await prisma.addOn.findMany({ orderBy: { sortOrder: 'asc' } })
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Add-ons</h1>
      <p className="mt-1 text-foreground/60">One-tap upsells. Put beverages first with a low sort order.</p>
      <CatalogEditor endpoint="/api/admin/addons" fields={FIELDS} items={addOns} blank={BLANK} noun="add-on" />
    </div>
  )
}
