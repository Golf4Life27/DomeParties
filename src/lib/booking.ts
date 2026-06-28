import { prisma } from '@/lib/db'
import { computeQuote, addOnLineTotal, baysFor } from '@/lib/pricing'
import { availability } from '@/lib/availability'
import { generateReference } from '@/lib/ref'
import { getStripe } from '@/lib/stripe'
import { applyPercent } from '@/lib/money'
import { debitGiftCard } from '@/lib/giftcards'
import {
  sendEmail,
  buildConfirmationEmail,
  buildIcs,
  buildQuoteEmail,
  buildRecoveryEmail,
} from '@/lib/email'
import type { AddOnSelection } from '@/lib/types'
import type { EventType } from '@/generated/prisma'

function dateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}
function dateStrOf(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Step 1: capture email, create a DRAFT (abandoned-cart recovery target). */
export async function createDraft(email: string, eventType: EventType) {
  let reference = generateReference()
  // extremely unlikely collision guard
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.booking.findUnique({ where: { reference } })
    if (!exists) break
    reference = generateReference()
  }
  return prisma.booking.create({
    data: {
      reference,
      status: 'DRAFT',
      eventType,
      customerEmail: email,
      date: dateOnly('1970-01-01'),
      startMinutes: 0,
      endMinutes: 0,
    },
    select: { id: true, reference: true },
  })
}

export type UpdateBookingFields = {
  dateStr?: string
  startMinutes?: number
  partySize?: number
  packageId?: string | null
  fnbPackageId?: string | null
  addOns?: AddOnSelection[]
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  notes?: string
  waiverSigned?: boolean
  waiverSignedName?: string
  waiverGuardian?: boolean
}

/** Persist in-progress selections on a DRAFT booking. */
export async function updateDraft(id: string, fields: UpdateBookingFields) {
  const data: Record<string, unknown> = {}
  if (fields.dateStr) data.date = dateOnly(fields.dateStr)
  if (fields.startMinutes !== undefined) data.startMinutes = fields.startMinutes
  if (fields.partySize !== undefined) data.partySize = fields.partySize
  if (fields.packageId !== undefined) data.packageId = fields.packageId
  if (fields.fnbPackageId !== undefined) data.fnbPackageId = fields.fnbPackageId
  if (fields.customerName !== undefined) data.customerName = fields.customerName
  if (fields.customerEmail !== undefined) data.customerEmail = fields.customerEmail
  if (fields.customerPhone !== undefined) data.customerPhone = fields.customerPhone
  if (fields.notes !== undefined) data.notes = fields.notes
  if (fields.waiverSigned !== undefined) {
    data.waiverSigned = fields.waiverSigned
    data.waiverSignedAt = fields.waiverSigned ? new Date() : null
  }
  if (fields.waiverSignedName !== undefined) data.waiverSignedName = fields.waiverSignedName
  if (fields.waiverGuardian !== undefined) data.waiverGuardian = fields.waiverGuardian

  await prisma.booking.update({ where: { id }, data })

  if (fields.addOns) {
    await prisma.bookingAddOn.deleteMany({ where: { bookingId: id } })
    if (fields.addOns.length) {
      const addOns = await prisma.addOn.findMany({
        where: { id: { in: fields.addOns.map((a) => a.addOnId) } },
      })
      const byId = new Map(addOns.map((a) => [a.id, a]))
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id } })
      for (const sel of fields.addOns) {
        const a = byId.get(sel.addOnId)
        if (!a) continue
        const lineTotal = addOnLineTotal(a.unit, a.price, booking.partySize, sel.quantity)
        await prisma.bookingAddOn.create({
          data: {
            bookingId: id,
            addOnId: a.id,
            quantity: Math.max(1, sel.quantity),
            unitPrice: a.price,
            lineTotal,
          },
        })
      }
    }
  }
  return prisma.booking.findUniqueOrThrow({ where: { id }, include: { addOns: true } })
}

export class BookingConflictError extends Error {}
export class BookingIncompleteError extends Error {}

/**
 * Place an authoritative hold: validate, compute the final quote, assign
 * concrete bays, persist amounts, and move DRAFT -> PENDING. Idempotent for a
 * given booking (re-running reassigns from the same inputs).
 */
export async function placeHold(id: string) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id },
    include: { addOns: true },
  })
  if (!booking.packageId || !booking.partySize || booking.startMinutes === undefined) {
    throw new BookingIncompleteError('Missing package, party size, or time')
  }
  if (!booking.customerName || !booking.customerEmail) {
    throw new BookingIncompleteError('Missing customer details')
  }
  if (!booking.waiverSigned) {
    throw new BookingIncompleteError('Waiver not signed')
  }

  const quote = await computeQuote({
    partySize: booking.partySize,
    packageId: booking.packageId,
    fnbPackageId: booking.fnbPackageId,
    addOns: booking.addOns.map((a) => ({ addOnId: a.addOnId, quantity: a.quantity })),
  })

  const dateStr = dateStrOf(booking.date)
  const startMinutes = booking.startMinutes
  const endMinutes = startMinutes + quote.durationMinutes

  const bays = await availability.assignBays(
    dateStr,
    startMinutes,
    endMinutes,
    quote.baysNeeded,
    booking.id,
  )
  if (!bays) {
    throw new BookingConflictError('That time was just taken — please pick another slot.')
  }

  await prisma.$transaction(async (tx) => {
    await tx.bookingResource.deleteMany({ where: { bookingId: id } })
    await tx.bookingResource.createMany({
      data: bays.map((resourceId) => ({ bookingId: id, resourceId })),
    })
    await tx.booking.update({
      where: { id },
      data: {
        status: 'PENDING',
        endMinutes,
        baysNeeded: quote.baysNeeded,
        packageTotal: quote.packageTotal,
        fnbTotal: quote.fnbTotal,
        addOnsTotal: quote.addOnsTotal,
        serviceCharge: quote.serviceCharge,
        taxAmount: quote.taxAmount,
        total: quote.total,
        depositAmount: quote.depositAmount,
        balanceDue: quote.balanceDue,
      },
    })
  })

  return { booking: await prisma.booking.findUniqueOrThrow({ where: { id } }), quote }
}

export type QuoteInput = {
  total: number // cents
  dateStr: string
  startMinutes: number
  durationMinutes: number
  partySize: number
  message?: string | null
}

/**
 * Staff action: turn a lead into a PENDING quote booking with a custom total,
 * attempt to hold bays, email the customer a deposit pay link, and advance the
 * lead to PROPOSAL_SENT. Returns the booking + the pay URL.
 */
export async function createQuoteBookingFromLead(leadId: string, input: QuoteInput) {
  const [lead, setting] = await Promise.all([
    prisma.lead.findUniqueOrThrow({ where: { id: leadId } }),
    prisma.setting.findUniqueOrThrow({ where: { id: 1 } }),
  ])

  const depositAmount = applyPercent(input.total, setting.depositPercent)
  const balanceDue = input.total - depositAmount
  const endMinutes = input.startMinutes + input.durationMinutes
  const baysNeeded = baysFor(input.partySize, setting.bayCapacity)

  let reference = generateReference()
  for (let i = 0; i < 5; i++) {
    if (!(await prisma.booking.findUnique({ where: { reference } }))) break
    reference = generateReference()
  }

  const booking = await prisma.booking.create({
    data: {
      reference,
      status: 'PENDING',
      eventType: lead.eventType,
      date: new Date(`${input.dateStr}T00:00:00.000Z`),
      startMinutes: input.startMinutes,
      endMinutes,
      partySize: input.partySize,
      baysNeeded,
      customerName: lead.customerName,
      customerEmail: lead.customerEmail,
      customerPhone: lead.customerPhone,
      notes: input.message ?? null,
      packageTotal: input.total, // lump custom quote
      total: input.total,
      depositAmount,
      balanceDue,
    },
  })

  // Best-effort bay hold (custom events may be coordinated manually if full).
  const bays = await availability.assignBays(
    input.dateStr,
    input.startMinutes,
    endMinutes,
    baysNeeded,
    booking.id,
  )
  if (bays) {
    await prisma.bookingResource.createMany({
      data: bays.map((resourceId) => ({ bookingId: booking.id, resourceId })),
    })
  }

  await prisma.lead.update({ where: { id: leadId }, data: { status: 'PROPOSAL_SENT' } })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const payUrl = `${appUrl}/pay/${booking.id}`
  const email = buildQuoteEmail({
    name: lead.customerName,
    reference,
    total: input.total,
    depositAmount,
    payUrl,
    message: input.message,
  })
  if (lead.customerEmail) {
    await sendEmail({ to: lead.customerEmail, subject: email.subject, html: email.html, text: email.text })
  }

  return { booking, payUrl, baysAssigned: !!bays }
}

/**
 * Create a Stripe PaymentIntent for the deposit, or return dev-mode info when
 * Stripe is not configured.
 */
export async function createDepositIntent(id: string) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id } })
  const amountDue = Math.max(0, booking.depositAmount - booking.giftCardApplied)

  // A gift card covering the full deposit means nothing to charge now.
  if (amountDue <= 0) {
    return { mode: 'covered' as const, clientSecret: null, amount: 0 }
  }

  const stripe = getStripe()
  if (!stripe) {
    return { mode: 'dev' as const, clientSecret: null, amount: amountDue }
  }
  const intent = await stripe.paymentIntents.create({
    amount: amountDue,
    currency: 'usd',
    metadata: { bookingId: booking.id, reference: booking.reference, kind: 'deposit' },
    description: `Deposit — ${booking.reference} — Whitetail Ridge Golf Dome`,
  })
  await prisma.booking.update({
    where: { id },
    data: { stripePaymentIntentId: intent.id },
  })
  return { mode: 'stripe' as const, clientSecret: intent.client_secret, amount: amountDue }
}

/** Send one abandoned-cart recovery email and stamp the booking. */
export async function sendRecoveryEmail(id: string) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id } })
  if (booking.status !== 'DRAFT' || !booking.customerEmail) return false
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const resumeUrl = `${appUrl}/book?draft=${booking.id}`
  const email = buildRecoveryEmail({ name: booking.customerName, resumeUrl })
  await sendEmail({ to: booking.customerEmail, subject: email.subject, html: email.html, text: email.text })
  await prisma.booking.update({ where: { id }, data: { recoveryEmailSentAt: new Date() } })
  return true
}

/**
 * Send recovery emails to stale DRAFT carts (older than `minutesOld`, with an
 * email, not yet emailed). Returns how many were sent. Wire to a scheduler
 * (e.g. Vercel Cron) hitting /api/cron/recovery.
 */
export async function sendRecoveryEmailsToStaleDrafts(minutesOld = 60) {
  const cutoff = new Date(Date.now() - minutesOld * 60_000)
  const drafts = await prisma.booking.findMany({
    where: {
      status: 'DRAFT',
      customerEmail: { not: null },
      recoveryEmailSentAt: null,
      updatedAt: { lt: cutoff },
    },
    take: 200,
  })
  let sent = 0
  for (const d of drafts) {
    try {
      if (await sendRecoveryEmail(d.id)) sent++
    } catch (e) {
      console.error('recovery email failed for', d.id, e)
    }
  }
  return { eligible: drafts.length, sent }
}

/** Mark deposit paid -> CONFIRMED and send the confirmation email + invite. */
export async function confirmPaid(id: string, paymentIntentId?: string) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id },
    include: { package: true },
  })
  if (booking.status === 'CONFIRMED') return booking // idempotent

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status: 'CONFIRMED',
      depositPaid: true,
      paidAt: new Date(),
      ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
    },
    include: { package: true },
  })

  // Debit any applied gift card now that the booking is confirmed.
  if (updated.giftCardCode && updated.giftCardApplied > 0) {
    try {
      await debitGiftCard(updated.giftCardCode, updated.giftCardApplied)
    } catch (e) {
      console.error('gift debit failed', e)
    }
  }

  const data = {
    reference: updated.reference,
    customerName: updated.customerName ?? 'Guest',
    dateStr: dateStrOf(updated.date),
    startMinutes: updated.startMinutes,
    endMinutes: updated.endMinutes,
    partySize: updated.partySize,
    packageName: updated.package?.name ?? 'Event package',
    total: updated.total,
    depositAmount: updated.depositAmount,
    balanceDue: updated.balanceDue,
  }
  const email = buildConfirmationEmail(data)
  const ics = buildIcs(data)
  if (updated.customerEmail) {
    await sendEmail({
      to: updated.customerEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
      icsContent: ics,
    })
  }
  return updated
}
