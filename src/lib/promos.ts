import { prisma } from '@/lib/db'
import { applyPercent } from '@/lib/money'

export type PromoValidation =
  | { ok: true; discount: number; code: string }
  | { ok: false; reason: string }

/**
 * Validate a promo code against a booking's total and event date.
 * `dayOfWeek` is the event's DOW (0=Sun..6=Sat) for weekday-only campaigns.
 */
export async function validatePromo(
  rawCode: string,
  total: number,
  dayOfWeek: number,
): Promise<PromoValidation> {
  const code = rawCode.trim().toUpperCase()
  const promo = await prisma.promoCode.findUnique({ where: { code } })
  if (!promo || !promo.active) return { ok: false, reason: 'That code isn’t valid.' }

  const now = new Date()
  if (promo.startsAt && now < promo.startsAt) return { ok: false, reason: 'That code isn’t active yet.' }
  if (promo.endsAt && now > promo.endsAt) return { ok: false, reason: 'That code has expired.' }
  if (promo.maxRedemptions > 0 && promo.timesRedeemed >= promo.maxRedemptions) {
    return { ok: false, reason: 'That code has been fully redeemed.' }
  }
  if (promo.minTotal > 0 && total < promo.minTotal) {
    return { ok: false, reason: 'Your booking doesn’t meet the minimum for that code.' }
  }
  if (promo.appliesDays.length > 0 && !promo.appliesDays.includes(dayOfWeek)) {
    return { ok: false, reason: 'That code isn’t valid for your event date.' }
  }

  const discount = Math.min(
    promo.percentOff > 0 ? applyPercent(total, promo.percentOff) : promo.amountOff,
    total,
  )
  if (discount <= 0) return { ok: false, reason: 'That code has no value.' }
  return { ok: true, discount, code }
}

/** Count a redemption (called once when a booking with a promo confirms). */
export async function redeemPromo(code: string) {
  try {
    await prisma.promoCode.update({
      where: { code },
      data: { timesRedeemed: { increment: 1 } },
    })
  } catch (e) {
    console.error('promo redemption count failed', e)
  }
}

/** The featured promo (if any) to sweeten late recovery emails. */
export async function featuredRecoveryPromo() {
  const now = new Date()
  const promos = await prisma.promoCode.findMany({
    where: { active: true, featuredInRecovery: true },
    orderBy: { createdAt: 'desc' },
  })
  return (
    promos.find(
      (p) =>
        (!p.startsAt || p.startsAt <= now) &&
        (!p.endsAt || p.endsAt >= now) &&
        (p.maxRedemptions === 0 || p.timesRedeemed < p.maxRedemptions),
    ) ?? null
  )
}
