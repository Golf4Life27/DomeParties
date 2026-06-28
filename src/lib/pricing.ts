import { prisma } from '@/lib/db'
import { applyPercent, formatCents } from '@/lib/money'
import { isPeakSlot } from '@/lib/time'
import type { Quote, QuoteInput, QuoteLine } from '@/lib/types'

/** Number of bays an event of `partySize` needs (each bay holds `bayCapacity`). */
export function baysFor(partySize: number, bayCapacity: number): number {
  return Math.max(1, Math.ceil(partySize / bayCapacity))
}

/**
 * Per-bay-per-hour rate for `bays` at a given slot. With a date/time, returns
 * the most specific matching rate (highest minBays tier wins → volume discount).
 * Without one, returns the cheapest applicable rate (a "from" estimate).
 */
export async function getBayRate(
  bays: number,
  hours: number,
  dateStr?: string | null,
  startMinutes?: number | null,
  tag = 'birthday',
): Promise<{ rate: number; estimated: boolean }> {
  const rows = await prisma.bayRate.findMany({ where: { active: true, tag } })
  const applicable = rows.filter((r) => r.minBays <= bays && r.minHours <= hours)
  if (applicable.length === 0) return { rate: 0, estimated: true }

  // specificity: prefer the highest bays tier, then the highest duration tier
  const score = (r: { minBays: number; minHours: number }) => r.minBays * 1000 + r.minHours

  if (dateStr && startMinutes != null) {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    const matches = applicable.filter(
      (r) => r.daysOfWeek.includes(dow) && r.startMinute <= startMinutes && startMinutes < r.endMinute,
    )
    if (matches.length) {
      const best = matches.reduce((a, b) => (score(b) > score(a) ? b : a))
      return { rate: best.ratePerHour, estimated: false }
    }
  }
  // "From" price: cheapest applicable rate (off-peak).
  const cheapest = applicable.reduce((a, b) => (b.ratePerHour < a.ratePerHour ? b : a))
  return { rate: cheapest.ratePerHour, estimated: true }
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
  const isBayRate = pkg.pricingType === 'BAY_RATE'
  const bays = isBayRate ? pkg.bays : baysFor(partySize, setting.bayCapacity)
  let estimated = false
  let packageTotal: number
  let packageDetail: string

  if (isBayRate) {
    const hours = pkg.durationMinutes / 60
    const { rate, estimated: est } = await getBayRate(bays, hours, input.dateStr, input.startMinutes, pkg.rateTag)
    estimated = est
    packageTotal = Math.round(bays * hours * rate)
    packageDetail = `${bays} bays × ${hours} hr × ${formatCents(rate)}/bay·hr${est ? ' (from)' : ''}`
  } else if (pkg.pricingType === 'PER_PERSON') {
    packageTotal = pkg.pricePerPerson * partySize
    packageDetail = `${formatCents(pkg.pricePerPerson)} × ${partySize} guests`
  } else {
    packageTotal = pkg.flatPrice
    packageDetail = 'Flat rate'
  }
  lines.push({ label: `${pkg.name} package`, detail: packageDetail, amount: packageTotal })

  // --- Dynamic pricing (peak surcharge / off-peak discount on bay time) ---
  // BAY_RATE packages already encode day/time in the rate table — skip here.
  let peakAdjustment = 0
  if (!isBayRate && input.dateStr && input.startMinutes != null) {
    const peak = isPeakSlot(input.dateStr)
    if (peak && setting.peakSurchargePct > 0) {
      peakAdjustment = applyPercent(packageTotal, setting.peakSurchargePct)
      lines.push({
        label: `Peak weekend pricing (+${setting.peakSurchargePct}%)`,
        detail: 'Premium time slot',
        amount: peakAdjustment,
      })
    } else if (!peak && setting.offPeakDiscountPct > 0) {
      peakAdjustment = -applyPercent(packageTotal, setting.offPeakDiscountPct)
      lines.push({
        label: `Off-peak savings (${setting.offPeakDiscountPct}% off)`,
        detail: 'Thanks for booking a quieter time!',
        amount: peakAdjustment,
      })
    }
  }

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
  const goodsSubtotal = packageTotal + peakAdjustment + fnbTotal + addOnsTotal
  const taxAmount = Math.round((goodsSubtotal * setting.taxPct) / 100)
  lines.push({
    label: `Sales tax (${setting.taxPct}%)`,
    amount: taxAmount,
  })

  const total = goodsSubtotal + serviceCharge + taxAmount
  const depositAmount = applyPercent(total, setting.depositPercent)
  const balanceDue = total - depositAmount

  return {
    baysNeeded: bays,
    durationMinutes: pkg.durationMinutes,
    estimated,
    lines,
    packageTotal,
    peakAdjustment,
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
