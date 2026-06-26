import { prisma } from '@/lib/db'
import { applyPercent, formatCents } from '@/lib/money'
import type { Quote, QuoteInput, QuoteLine } from '@/lib/types'

/** Number of bays an event of `partySize` needs (each bay holds `bayCapacity`). */
export function baysFor(partySize: number, bayCapacity: number): number {
  return Math.max(1, Math.ceil(partySize / bayCapacity))
}

/** Line total in cents for one add-on selection, honoring its unit. */
export function addOnLineTotal(
  unit: 'FLAT' | 'PER_PERSON' | 'PER_30_MIN',
  price: number,
  partySize: number,
  qty: number,
): number {
  const q = Math.max(1, qty)
  if (unit === 'PER_PERSON') return price * partySize
  return price * q // FLAT and PER_30_MIN both scale by quantity
}

/**
 * Compute a full, transparent quote for an Instant Book selection.
 * All amounts in integer cents. Tax shown up front (anti-pattern to hide it);
 * service charge applies to the F&B + staffed portion per venue policy.
 */
export async function computeQuote(input: QuoteInput): Promise<Quote> {
  const [setting, pkg, fnb, addOns] = await Promise.all([
    prisma.setting.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.package.findUniqueOrThrow({ where: { id: input.packageId } }),
    input.fnbPackageId
      ? prisma.fnbPackage.findUnique({ where: { id: input.fnbPackageId } })
      : Promise.resolve(null),
    input.addOns.length
      ? prisma.addOn.findMany({ where: { id: { in: input.addOns.map((a) => a.addOnId) } } })
      : Promise.resolve([]),
  ])

  const partySize = Math.max(pkg.minGuests, input.partySize)
  const lines: QuoteLine[] = []

  // --- Package ---
  const packageTotal =
    pkg.pricingType === 'PER_PERSON' ? pkg.pricePerPerson * partySize : pkg.flatPrice
  lines.push({
    label: `${pkg.name} package`,
    detail:
      pkg.pricingType === 'PER_PERSON'
        ? `${formatCents(pkg.pricePerPerson)} × ${partySize} guests`
        : 'Flat rate',
    amount: packageTotal,
  })

  // --- F&B ---
  let fnbTotal = 0
  let serviceChargeBase = 0
  if (fnb) {
    fnbTotal = fnb.pricingType === 'PER_PERSON' ? fnb.price * partySize : fnb.price
    if (fnb.serviceCharge) serviceChargeBase += fnbTotal
    lines.push({
      label: `${fnb.name} (food & beverage)`,
      detail:
        fnb.pricingType === 'PER_PERSON'
          ? `${formatCents(fnb.price)} × ${partySize} guests`
          : 'Platter',
      amount: fnbTotal,
    })
  }

  // --- Add-ons ---
  let addOnsTotal = 0
  const addOnById = new Map(addOns.map((a) => [a.id, a]))
  for (const sel of input.addOns) {
    const a = addOnById.get(sel.addOnId)
    if (!a) continue
    const qty = Math.max(1, sel.quantity)
    let line = 0
    let detail = ''
    if (a.unit === 'PER_PERSON') {
      line = a.price * partySize
      detail = `${formatCents(a.price)} × ${partySize} guests`
    } else if (a.unit === 'PER_30_MIN') {
      line = a.price * qty
      detail = `${formatCents(a.price)} × ${qty} × 30 min`
    } else {
      line = a.price * qty
      detail = qty > 1 ? `${formatCents(a.price)} × ${qty}` : undefined!
    }
    addOnsTotal += line
    if (a.serviceCharge) serviceChargeBase += line
    lines.push({ label: a.name, detail, amount: line })
  }

  // --- Service charge (on F&B + staffed portion) ---
  const serviceCharge = applyPercent(serviceChargeBase, setting.serviceChargePct)
  if (serviceCharge > 0) {
    lines.push({
      label: `Service charge (${setting.serviceChargePct}%)`,
      detail: 'Applied to food, beverage & staffed service',
      amount: serviceCharge,
    })
  }

  // --- Tax (shown up front) ---
  const goodsSubtotal = packageTotal + fnbTotal + addOnsTotal
  const taxAmount = Math.round((goodsSubtotal * setting.taxPct) / 100)
  lines.push({
    label: `Sales tax (${setting.taxPct}%)`,
    amount: taxAmount,
  })

  const total = goodsSubtotal + serviceCharge + taxAmount
  const depositAmount = applyPercent(total, setting.depositPercent)
  const balanceDue = total - depositAmount

  return {
    baysNeeded: baysFor(partySize, setting.bayCapacity),
    durationMinutes: pkg.durationMinutes,
    lines,
    packageTotal,
    fnbTotal,
    addOnsTotal,
    serviceCharge,
    serviceChargePct: setting.serviceChargePct,
    taxAmount,
    taxPct: setting.taxPct,
    total,
    depositAmount,
    depositPercent: setting.depositPercent,
    balanceDue,
    perPersonEffective: Math.round(total / partySize),
  }
}
