import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { sendEmail, buildGiftCardEmails } from '@/lib/email'

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
function giftCode(): string {
  let c = ''
  for (let i = 0; i < 8; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return `GIFT-${c.slice(0, 4)}-${c.slice(4)}`
}

export async function createGiftPurchase(input: {
  amount: number // cents
  purchaserName?: string
  purchaserEmail?: string
  recipientName?: string
  recipientEmail?: string
  message?: string
}) {
  let code = giftCode()
  for (let i = 0; i < 5; i++) {
    if (!(await prisma.giftCard.findUnique({ where: { code } }))) break
    code = giftCode()
  }
  return prisma.giftCard.create({
    data: {
      code,
      initialAmount: input.amount,
      balance: input.amount,
      status: 'PENDING',
      purchaserName: input.purchaserName,
      purchaserEmail: input.purchaserEmail,
      recipientName: input.recipientName,
      recipientEmail: input.recipientEmail,
      message: input.message,
    },
  })
}

/** Create the Stripe PaymentIntent for the full gift amount (or dev fallback). */
export async function createGiftPaymentIntent(id: string) {
  const gift = await prisma.giftCard.findUniqueOrThrow({ where: { id } })
  const stripe = getStripe()
  if (!stripe) return { mode: 'dev' as const, clientSecret: null, amount: gift.initialAmount }
  const intent = await stripe.paymentIntents.create({
    amount: gift.initialAmount,
    currency: 'usd',
    metadata: { giftCardId: gift.id, code: gift.code, kind: 'gift' },
    description: `Gift card ${gift.code} — Whitetail Ridge Golf Dome`,
  })
  await prisma.giftCard.update({ where: { id }, data: { stripePaymentIntentId: intent.id } })
  return { mode: 'stripe' as const, clientSecret: intent.client_secret, amount: gift.initialAmount }
}

/** Mark a gift card paid -> ACTIVE and email the recipient + purchaser. */
export async function confirmGiftPaid(id: string, paymentIntentId?: string) {
  const gift = await prisma.giftCard.findUniqueOrThrow({ where: { id } })
  if (gift.status === 'ACTIVE' || gift.status === 'REDEEMED') return gift // idempotent
  const updated = await prisma.giftCard.update({
    where: { id },
    data: { status: 'ACTIVE', ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}) },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const emails = buildGiftCardEmails({
    code: updated.code,
    amount: updated.initialAmount,
    recipientName: updated.recipientName,
    purchaserName: updated.purchaserName,
    message: updated.message,
    redeemUrl: `${appUrl}/book`,
  })
  if (updated.recipientEmail) {
    await sendEmail({ to: updated.recipientEmail, ...emails.recipient })
  }
  if (updated.purchaserEmail && updated.purchaserEmail !== updated.recipientEmail) {
    await sendEmail({ to: updated.purchaserEmail, ...emails.purchaser })
  }
  return updated
}

export type GiftValidation =
  | { ok: true; balance: number; code: string }
  | { ok: false; reason: string }

/** Validate a gift code for redemption. */
export async function validateGiftCard(code: string): Promise<GiftValidation> {
  const gift = await prisma.giftCard.findUnique({ where: { code: code.trim().toUpperCase() } })
  if (!gift) return { ok: false, reason: 'Gift card not found.' }
  if (gift.status === 'PENDING') return { ok: false, reason: 'This gift card is not active yet.' }
  if (gift.status === 'VOID') return { ok: false, reason: 'This gift card is no longer valid.' }
  if (gift.balance <= 0) return { ok: false, reason: 'This gift card has no balance left.' }
  return { ok: true, balance: gift.balance, code: gift.code }
}

/** Decrement a gift card balance by `amount` (called at booking confirmation). */
export async function debitGiftCard(code: string, amount: number) {
  const gift = await prisma.giftCard.findUnique({ where: { code } })
  if (!gift) return
  const newBalance = Math.max(0, gift.balance - amount)
  await prisma.giftCard.update({
    where: { code },
    data: { balance: newBalance, status: newBalance === 0 ? 'REDEEMED' : gift.status },
  })
}
