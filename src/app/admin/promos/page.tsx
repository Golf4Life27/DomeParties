import { prisma } from '@/lib/db'
import CatalogEditor, { type FieldDef } from '../CatalogEditor'

export const dynamic = 'force-dynamic'

const FIELDS: FieldDef[] = [
  { key: 'code', label: 'Code (customers type this)' },
  { key: 'description', label: 'Internal description' },
  { key: 'percentOff', label: '% off (0 = use $ off)', type: 'int' },
  { key: 'amountOff', label: '$ off (used when % is 0)', type: 'money' },
  { key: 'minTotal', label: 'Minimum booking total', type: 'money' },
  { key: 'appliesDays', label: 'Event days allowed (0=Sun … 6=Sat, blank = any)', type: 'intlist' },
  { key: 'startsAt', label: 'Starts (YYYY-MM-DD, blank = now)' },
  { key: 'endsAt', label: 'Ends (YYYY-MM-DD, blank = never)' },
  { key: 'maxRedemptions', label: 'Max redemptions (0 = unlimited)', type: 'int' },
  { key: 'timesRedeemed', label: 'Times redeemed', type: 'int' },
  { key: 'featuredInRecovery', label: 'Offer in abandoned-cart emails', type: 'bool' },
  { key: 'active', label: 'Active', type: 'bool' },
]

const BLANK = {
  code: '', description: '', percentOff: 15, amountOff: 0, minTotal: 0,
  appliesDays: [1, 2, 3, 4], startsAt: '', endsAt: '', maxRedemptions: 0,
  timesRedeemed: 0, featuredInRecovery: false, active: true,
}

export default async function PromosAdmin() {
  const promos = await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } })
  const items = promos.map((p) => ({
    ...p,
    startsAt: p.startsAt ? p.startsAt.toISOString().slice(0, 10) : '',
    endsAt: p.endsAt ? p.endsAt.toISOString().slice(0, 10) : '',
  }))
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Promo codes</h1>
      <p className="mt-1 max-w-2xl text-foreground/60">
        Run campaigns like <strong>WEEKDAY15</strong> (15% off, event days 1,2,3,4) to fill
        Mon–Thu troughs. Discounts apply to the booking total at checkout; “Offer in
        abandoned-cart emails” sweetens the 2nd/3rd recovery touch.
      </p>
      <CatalogEditor endpoint="/api/admin/promos" fields={FIELDS} items={items} blank={BLANK} noun="promo code" />
    </div>
  )
}
