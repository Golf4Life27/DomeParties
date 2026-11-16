import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { computeQuote } from '@/lib/pricing'

// GET /api/audit/payments?k=TOKEN — READ-ONLY payment audit, preview only.
// Lists every booking that has money on it and every Stripe payment the site
// minted, so the two can be matched. Writes nothing to the database or Stripe.
// Answers 404 anywhere except the payment-audit preview with its token set.
export const maxDuration = 300

function short(name: string | null): string | null {
  if (!name) return null
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
}

export async function GET(req: NextRequest) {
  const token = process.env.AUDIT_TOKEN
  if (process.env.VERCEL_ENV !== 'preview' || !token || req.nextUrl.searchParams.get('k') !== token) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } })
  const bookings = await prisma.booking.findMany({
    where: { status: { not: 'DRAFT' } },
    include: { package: true, fnbPackage: true, addOns: { include: { addOn: true } } },
    orderBy: { createdAt: 'asc' },
  })
  // Drafts that carry a Stripe intent: a paid deposit can land on one after its
  // hold expired and the booking was reverted to DRAFT.
  const draftsWithIntent = await prisma.booking.findMany({
    where: { status: 'DRAFT', OR: [{ stripePaymentIntentId: { not: null } }, { depositAmount: { gt: 0 } }] },
    include: { package: true, fnbPackage: true, addOns: { include: { addOn: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const rows = []
  for (const b of [...bookings, ...draftsWithIntent]) {
    let recomputed: Record<string, unknown> | null = null
    if (b.packageId) {
      try {
        const q = await computeQuote({
          partySize: b.partySize,
          fnbGuests: b.fnbGuests,
          packageId: b.packageId,
          fnbPackageId: b.fnbPackageId,
          addOns: b.addOns.map((a) => ({ addOnId: a.addOnId, quantity: a.quantity })),
          dateStr: b.date.toISOString().slice(0, 10),
          startMinutes: b.startMinutes,
        })
        recomputed = {
          packageTotal: q.packageTotal + q.peakAdjustment,
          fnbTotal: q.fnbTotal,
          addOnsTotal: q.addOnsTotal,
          serviceCharge: q.serviceCharge,
          taxAmount: q.taxAmount,
          totalBeforePromo: q.total,
          estimated: q.estimated,
        }
      } catch (e) {
        recomputed = { error: String(e) }
      }
    }
    rows.push({
      id: b.id,
      reference: b.reference,
      status: b.status,
      guest: short(b.customerName),
      date: b.date.toISOString().slice(0, 10),
      startMinutes: b.startMinutes,
      partySize: b.partySize,
      fnbGuests: b.fnbGuests,
      package: b.package ? { name: b.package.name, pricingType: b.package.pricingType, flatPrice: b.package.flatPrice, pricePerPerson: b.package.pricePerPerson } : null,
      fnbPackage: b.fnbPackage ? { name: b.fnbPackage.name, price: b.fnbPackage.price } : null,
      addOns: b.addOns.map((a) => ({ name: a.addOn.name, qty: a.quantity, unitPriceAtBooking: a.unitPrice, lineTotal: a.lineTotal, livePrice: a.addOn.price, unit: a.addOn.unit })),
      stored: {
        packageTotal: b.packageTotal, fnbTotal: b.fnbTotal, addOnsTotal: b.addOnsTotal,
        serviceCharge: b.serviceCharge, taxAmount: b.taxAmount, total: b.total,
        depositAmount: b.depositAmount, depositPaid: b.depositPaid, balanceDue: b.balanceDue,
        balancePaid: b.balancePaid, balancePaidAmount: b.balancePaidAmount,
        promoCode: b.promoCode, promoDiscount: b.promoDiscount,
        giftCardApplied: b.giftCardApplied,
      },
      depositIntent: b.stripePaymentIntentId,
      balanceIntent: b.stripeBalanceIntentId,
      paidAt: b.paidAt, needsReview: b.needsReview, holdExpiresAt: b.holdExpiresAt,
      recoveryStage: b.recoveryStage, recoveryEmailSentAt: b.recoveryEmailSentAt,
      rescheduledAt: b.rescheduledAt,
      createdAt: b.createdAt, updatedAt: b.updatedAt,
      recomputed,
    })
  }

  // Every PaymentIntent on the account (read only).
  const stripe = getStripe()
  const intents: Record<string, unknown>[] = []
  if (stripe) {
    for await (const pi of stripe.paymentIntents.list({ limit: 100, expand: ['data.latest_charge'] })) {
      const ch = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null
      intents.push({
        id: pi.id, amount: pi.amount, amount_received: pi.amount_received, status: pi.status,
        created: new Date(pi.created * 1000).toISOString(), livemode: pi.livemode,
        description: pi.description, metadata: pi.metadata,
        refunded: ch ? ch.amount_refunded : null, disputed: ch ? ch.disputed : null,
        payment_method_types: pi.payment_method_types,
      })
    }
  }

  return NextResponse.json({
    setting: {
      depositPercent: setting.depositPercent, serviceChargePct: setting.serviceChargePct,
      serviceChargeOnGolf: setting.serviceChargeOnGolf, taxPct: setting.taxPct,
      cardFeePct: setting.cardFeePct, peakSurchargePct: setting.peakSurchargePct,
      offPeakDiscountPct: setting.offPeakDiscountPct, holdMinutes: setting.holdMinutes,
      updatedAt: setting.updatedAt,
    },
    stripeMode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'live' : 'test',
    bookings: rows,
    intents,
  })
}
