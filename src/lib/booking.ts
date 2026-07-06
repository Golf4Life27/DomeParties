import { prisma } from '@/lib/db'
import { computeQuote, addOnLineTotal, baysFor } from '@/lib/pricing'
import { availability } from '@/lib/availability'
import { generateReference } from '@/lib/ref'
import { getStripe } from '@/lib/stripe'
import { applyPercent, formatCents } from '@/lib/money'
import { minutesToLabel } from '@/lib/time'
import { debitGiftCard } from '@/lib/giftcards'
import { redeemPromo, featuredRecoveryPromo } from '@/lib/promos'
import {
  sendEmail,
  buildConfirmationEmail,
  buildIcs,
  buildQuoteEmail,
  buildRecoveryEmail,
  buildDepositReceivedEmail,
  buildStaffNotification,
  buildReminderEmail,
  buildBalanceReceiptEmail,
  buildLeadFollowUpEmail,
} from '@/lib/email'
import type { AddOnSelection } from '@/lib/types'
import type { EventType } from '@/generated/prisma'

function dateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

/** Best-effort staff notification (no-op when staffNotifyEmail is unset). */
export async function notifyStaff(input: {
  title: string
  lines: string[]
  adminPath: string
  urgent?: boolean
}) {
  try {
    const setting = await prisma.setting.findUnique({ where: { id: 1 } })
    const to = setting?.staffNotifyEmail
    if (!to) return
    const email = buildStaffNotification(input)
    await sendEmail({ to, subject: email.subject, html: email.html, text: email.text })
  } catch (e) {
    console.error('staff notification failed', e)
  }
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
    include: { addOns: { include: { addOn: true } } },
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

  const dateStr = dateStrOf(booking.date)
  const startMinutes = booking.startMinutes

  const quote = await computeQuote({
    partySize: booking.partySize,
    packageId: booking.packageId,
    fnbPackageId: booking.fnbPackageId,
    addOns: booking.addOns.map((a) => ({ addOnId: a.addOnId, quantity: a.quantity })),
    dateStr,
    startMinutes,
  })

  // "+30 min" style add-ons extend the actual reserved window, not just the bill.
  const extraMinutes = booking.addOns
    .filter((a) => a.addOn.unit === 'PER_30_MIN')
    .reduce((sum, a) => sum + a.quantity * 30, 0)
  const endMinutes = startMinutes + quote.durationMinutes + extraMinutes

  const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } })
  if (endMinutes > setting.closeHour * 60) {
    throw new BookingConflictError(
      'With the extra time added, this booking would run past closing — pick an earlier start time or trim the extra time.',
    )
  }

  const assignment = await availability.assignBays(
    dateStr,
    startMinutes,
    endMinutes,
    quote.baysNeeded,
    booking.id,
  )
  if (!assignment) {
    throw new BookingConflictError('That time was just taken — please pick another slot.')
  }

  const holdExpiresAt = new Date(Date.now() + setting.holdMinutes * 60_000)

  await prisma.$transaction(async (tx) => {
    await tx.bookingResource.deleteMany({ where: { bookingId: id } })
    await tx.bookingResource.createMany({
      data: assignment.resourceIds.map((resourceId) => ({ bookingId: id, resourceId })),
    })
    await tx.booking.update({
      where: { id },
      data: {
        status: 'PENDING',
        needsReview: assignment.usedShared, // shared bays → staff confirm vs Trackman
        holdExpiresAt,
        endMinutes,
        baysNeeded: quote.baysNeeded,
        packageTotal: quote.packageTotal + quote.peakAdjustment, // fold peak into package line
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
  const assignment = await availability.assignBays(
    input.dateStr,
    input.startMinutes,
    endMinutes,
    baysNeeded,
    booking.id,
  )
  if (assignment) {
    await prisma.bookingResource.createMany({
      data: assignment.resourceIds.map((resourceId) => ({ bookingId: booking.id, resourceId })),
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

  return { booking, payUrl, baysAssigned: !!assignment }
}

/**
 * Create a Stripe PaymentIntent for the deposit, or return dev-mode info when
 * Stripe is not configured.
 */
export async function createDepositIntent(id: string) {
  const [booking, setting] = await Promise.all([
    prisma.booking.findUniqueOrThrow({ where: { id } }),
    prisma.setting.findUniqueOrThrow({ where: { id: 1 } }),
  ])
  const amountDue = Math.max(0, booking.depositAmount - booking.giftCardApplied)

  // A gift card covering the full deposit means nothing to charge now.
  if (amountDue <= 0) {
    return { mode: 'covered' as const, clientSecret: null, amount: 0, cardFee: 0 }
  }

  // Optional card convenience fee (off by default; setting.cardFeePct = 0).
  const cardFee = setting.cardFeePct > 0 ? Math.round((amountDue * setting.cardFeePct) / 100) : 0
  const charge = amountDue + cardFee

  const stripe = getStripe()
  if (!stripe) {
    return { mode: 'dev' as const, clientSecret: null, amount: charge, cardFee }
  }
  const intent = await stripe.paymentIntents.create({
    amount: charge,
    currency: 'usd',
    metadata: { bookingId: booking.id, reference: booking.reference, kind: 'deposit' },
    description: `Deposit — ${booking.reference} — Whitetail Ridge Golf Dome`,
  })
  await prisma.booking.update({
    where: { id },
    data: { stripePaymentIntentId: intent.id },
  })
  return { mode: 'stripe' as const, clientSecret: intent.client_secret, amount: charge, cardFee }
}

/**
 * Housekeeping: revert expired, unpaid checkout holds to DRAFT and free their
 * bays. (Availability already ignores them in real time; this keeps the admin
 * clean and makes the drafts recovery-email eligible.) Quote bookings have no
 * expiry and are untouched.
 */
export async function releaseExpiredHolds() {
  const expired = await prisma.booking.findMany({
    where: {
      status: 'PENDING',
      depositPaid: false,
      holdExpiresAt: { not: null, lt: new Date() },
    },
    select: { id: true },
  })
  for (const { id } of expired) {
    await prisma.$transaction([
      prisma.bookingResource.deleteMany({ where: { bookingId: id } }),
      prisma.booking.update({
        where: { id },
        data: { status: 'DRAFT', needsReview: false, holdExpiresAt: null },
      }),
    ])
  }
  return { released: expired.length }
}

/** Send one abandoned-cart recovery email (next stage) and stamp the booking. */
export async function sendRecoveryEmail(
  id: string,
  promo?: { code: string; percentOff: number; amountOff: number } | null,
) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id } })
  if (booking.status !== 'DRAFT' || !booking.customerEmail) return false
  const stage = Math.min(booking.recoveryStage + 1, 3) as 1 | 2 | 3
  const resumeUrl = `${appUrl()}/book?draft=${booking.id}`
  const email = buildRecoveryEmail({
    name: booking.customerName,
    resumeUrl,
    stage,
    promo: stage >= 2 ? promo : null, // sweeten only the later touches
  })
  await sendEmail({ to: booking.customerEmail, subject: email.subject, html: email.html, text: email.text })
  await prisma.booking.update({
    where: { id },
    data: { recoveryEmailSentAt: new Date(), recoveryStage: stage },
  })
  return true
}

/**
 * Staged abandoned-cart recovery (cron): touch 1 after `minutesOld`, touch 2
 * after 24h, touch 3 after 72h (later touches can feature a promo code).
 */
export async function sendRecoveryEmailsToStaleDrafts(minutesOld = 60) {
  const now = Date.now()
  const [first, second, third] = await Promise.all([
    prisma.booking.findMany({
      where: {
        status: 'DRAFT',
        customerEmail: { not: null },
        recoveryStage: 0,
        recoveryEmailSentAt: null,
        updatedAt: { lt: new Date(now - minutesOld * 60_000) },
      },
      select: { id: true },
      take: 200,
    }),
    prisma.booking.findMany({
      where: {
        status: 'DRAFT',
        customerEmail: { not: null },
        OR: [{ recoveryStage: 1 }, { recoveryStage: 0, recoveryEmailSentAt: { not: null } }],
        recoveryEmailSentAt: { lt: new Date(now - 24 * 3_600_000) },
      },
      select: { id: true },
      take: 200,
    }),
    prisma.booking.findMany({
      where: {
        status: 'DRAFT',
        customerEmail: { not: null },
        recoveryStage: 2,
        recoveryEmailSentAt: { lt: new Date(now - 72 * 3_600_000) },
      },
      select: { id: true },
      take: 200,
    }),
  ])

  const promo = await featuredRecoveryPromo()
  let sent = 0
  for (const { id } of [...first, ...second, ...third]) {
    try {
      if (await sendRecoveryEmail(id, promo)) sent++
    } catch (e) {
      console.error('recovery email failed for', id, e)
    }
  }
  return { eligible: first.length + second.length + third.length, sent }
}

/** 24h follow-up for NEW leads no one has closed yet (speed-to-lead insurance). */
export async function sendLeadFollowUps() {
  const cutoff = new Date(Date.now() - 24 * 3_600_000)
  const leads = await prisma.lead.findMany({
    where: { status: 'NEW', followUpSentAt: null, createdAt: { lt: cutoff } },
    take: 100,
  })
  let sent = 0
  for (const lead of leads) {
    try {
      const email = buildLeadFollowUpEmail({ name: lead.customerName, inquireUrl: `${appUrl()}/inquire` })
      await sendEmail({ to: lead.customerEmail, subject: email.subject, html: email.html, text: email.text })
      await prisma.lead.update({ where: { id: lead.id }, data: { followUpSentAt: new Date() } })
      sent++
    } catch (e) {
      console.error('lead follow-up failed for', lead.id, e)
    }
  }
  return { leadFollowUps: sent }
}

function confirmationData(b: {
  reference: string
  customerName: string | null
  date: Date
  startMinutes: number
  endMinutes: number
  partySize: number
  package: { name: string } | null
  total: number
  depositAmount: number
  balanceDue: number
}) {
  return {
    reference: b.reference,
    customerName: b.customerName ?? 'Guest',
    dateStr: dateStrOf(b.date),
    startMinutes: b.startMinutes,
    endMinutes: b.endMinutes,
    partySize: b.partySize,
    packageName: b.package?.name ?? 'Event package',
    total: b.total,
    depositAmount: b.depositAmount,
    balanceDue: b.balanceDue,
  }
}

/** Move a paid booking to CONFIRMED: debit gift, send confirmation + invite. */
async function finalizeConfirmed(id: string, paymentIntentId?: string) {
  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status: 'CONFIRMED',
      depositPaid: true,
      needsReview: false,
      holdExpiresAt: null,
      paidAt: new Date(),
      ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
    },
    include: { package: true },
  })

  if (updated.giftCardCode && updated.giftCardApplied > 0) {
    try {
      await debitGiftCard(updated.giftCardCode, updated.giftCardApplied)
    } catch (e) {
      console.error('gift debit failed', e)
    }
  }
  if (updated.promoCode) await redeemPromo(updated.promoCode)

  const data = confirmationData(updated)
  const links = guestLinks(updated.id)
  const email = buildConfirmationEmail({ ...data, manageUrl: links.manageUrl, inviteUrl: links.inviteUrl })
  if (updated.customerEmail) {
    await sendEmail({
      to: updated.customerEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
      icsContent: buildIcs(data),
    })
  }

  await notifyStaff({
    title: `New booking confirmed — ${updated.reference}`,
    lines: [
      `${updated.customerName ?? 'Guest'} · ${updated.partySize} guests · ${data.packageName}`,
      `${data.dateStr}, ${minutesToLabel(updated.startMinutes)}–${minutesToLabel(updated.endMinutes)}`,
      `Total ${formatCents(updated.total)} · deposit paid ${formatCents(updated.depositAmount)}`,
    ],
    adminPath: `/admin/bookings/${updated.id}`,
  })
  return updated
}

/**
 * Deposit succeeded. If the booking uses only Exclusive bays, confirm instantly.
 * If it touched Shared bays (needsReview), capture the deposit but hold for staff
 * confirmation against Trackman and send a "deposit received" email.
 */
export async function confirmPaid(id: string, paymentIntentId?: string) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id },
    include: { package: true },
  })
  if (booking.status === 'CONFIRMED') return booking // idempotent

  // If the payment landed after the hold expired, the bays may have been given
  // away — re-assign before confirming. If that fails, keep the deposit and
  // route to staff review rather than double-booking.
  let needsReview = booking.needsReview
  if (booking.holdExpiresAt && booking.holdExpiresAt < new Date()) {
    const assignment = await availability.assignBays(
      dateStrOf(booking.date),
      booking.startMinutes,
      booking.endMinutes,
      booking.baysNeeded,
      booking.id,
    )
    if (assignment) {
      await prisma.$transaction([
        prisma.bookingResource.deleteMany({ where: { bookingId: id } }),
        prisma.bookingResource.createMany({
          data: assignment.resourceIds.map((resourceId) => ({ bookingId: id, resourceId })),
        }),
      ])
      needsReview = assignment.usedShared
    } else {
      needsReview = true // bays gone — staff will re-slot with the guest
    }
    if (needsReview !== booking.needsReview) {
      await prisma.booking.update({ where: { id }, data: { needsReview } })
    }
  }

  if (needsReview) {
    const updated = await prisma.booking.update({
      where: { id },
      data: {
        depositPaid: true,
        paidAt: new Date(),
        ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
      },
      include: { package: true },
    })
    const email = buildDepositReceivedEmail(confirmationData(updated))
    if (updated.customerEmail) {
      await sendEmail({ to: updated.customerEmail, subject: email.subject, html: email.html, text: email.text })
    }
    await notifyStaff({
      title: `Booking needs review — ${updated.reference}`,
      lines: [
        `${updated.customerName ?? 'Guest'} paid a ${formatCents(updated.depositAmount)} deposit`,
        `${dateStrOf(updated.date)}, ${minutesToLabel(updated.startMinutes)}–${minutesToLabel(updated.endMinutes)} · ${updated.partySize} guests`,
        'Uses shared bays — check Trackman for conflicts, then Confirm to finalize.',
      ],
      adminPath: `/admin/bookings/${updated.id}`,
      urgent: true,
    })
    return updated // stays PENDING, awaiting staff review
  }

  return finalizeConfirmed(id, paymentIntentId)
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

export function guestLinks(bookingId: string) {
  const base = appUrl()
  return {
    manageUrl: `${base}/manage/${bookingId}`,
    inviteUrl: `${base}/invite/${bookingId}`,
    balanceUrl: `${base}/balance/${bookingId}`,
  }
}

/**
 * Send pre-event reminders (cron): a "week out" upsell reminder and a
 * "tomorrow" logistics reminder, each once per confirmed booking.
 */
export async function sendEventReminders() {
  const todayMidnight = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)
  const in1 = new Date(todayMidnight.getTime() + 1 * 86_400_000)
  const in7 = new Date(todayMidnight.getTime() + 7 * 86_400_000)

  const [weekOut, dayBefore] = await Promise.all([
    prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        customerEmail: { not: null },
        reminder7SentAt: null,
        date: { gt: in1, lte: in7 },
      },
      include: { package: true },
      take: 200,
    }),
    prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        customerEmail: { not: null },
        reminder1SentAt: null,
        date: { gte: todayMidnight, lte: in1 },
      },
      include: { package: true },
      take: 200,
    }),
  ])

  let sent = 0
  for (const [list, kind, stamp] of [
    [weekOut, 'week', 'reminder7SentAt'],
    [dayBefore, 'day', 'reminder1SentAt'],
  ] as const) {
    for (const b of list) {
      try {
        const email = buildReminderEmail(
          { ...confirmationData(b), balanceDue: b.balancePaid ? 0 : b.balanceDue, ...guestLinks(b.id) },
          kind,
        )
        await sendEmail({ to: b.customerEmail!, subject: email.subject, html: email.html, text: email.text })
        await prisma.booking.update({ where: { id: b.id }, data: { [stamp]: new Date() } })
        sent++
      } catch (e) {
        console.error(`${kind} reminder failed for`, b.id, e)
      }
    }
  }
  return { reminders: sent }
}

/** Stripe intent (or dev fallback) for the outstanding event balance. */
export async function createBalanceIntent(id: string) {
  const [booking, setting] = await Promise.all([
    prisma.booking.findUniqueOrThrow({ where: { id } }),
    prisma.setting.findUniqueOrThrow({ where: { id: 1 } }),
  ])
  if (booking.status !== 'CONFIRMED' || booking.balancePaid || booking.balanceDue <= 0) {
    return null
  }
  const cardFee = setting.cardFeePct > 0 ? Math.round((booking.balanceDue * setting.cardFeePct) / 100) : 0
  const charge = booking.balanceDue + cardFee

  const stripe = getStripe()
  if (!stripe) return { mode: 'dev' as const, clientSecret: null, amount: charge, cardFee }
  const intent = await stripe.paymentIntents.create({
    amount: charge,
    currency: 'usd',
    metadata: { bookingId: booking.id, reference: booking.reference, kind: 'balance' },
    description: `Balance — ${booking.reference} — Whitetail Ridge Golf Dome`,
  })
  return { mode: 'stripe' as const, clientSecret: intent.client_secret, amount: charge, cardFee }
}

/** Mark the event balance paid; receipt to guest, heads-up to staff. */
export async function confirmBalancePaid(id: string) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id }, include: { package: true } })
  if (booking.balancePaid) return booking // idempotent

  const receipt = buildBalanceReceiptEmail(confirmationData(booking))
  const updated = await prisma.booking.update({
    where: { id },
    data: { balancePaid: true, balancePaidAt: new Date() },
  })
  if (booking.customerEmail) {
    await sendEmail({ to: booking.customerEmail, subject: receipt.subject, html: receipt.html, text: receipt.text })
  }
  await notifyStaff({
    title: `Balance paid — ${booking.reference}`,
    lines: [
      `${booking.customerName ?? 'Guest'} paid the remaining ${formatCents(booking.balanceDue)}`,
      `Event ${dateStrOf(booking.date)} · fully paid`,
    ],
    adminPath: `/admin/bookings/${booking.id}`,
  })
  return updated
}

/**
 * Post-booking upsell: add a FLAT or PER_PERSON add-on to a CONFIRMED booking.
 * The line (plus service charge + tax) is added to the balance due at the event.
 * PER_30_MIN is excluded post-booking (it would change the reserved window).
 */
export async function addAddOnToConfirmed(bookingId: string, addOnId: string, quantity = 1) {
  const [booking, addOn, setting] = await Promise.all([
    prisma.booking.findUniqueOrThrow({ where: { id: bookingId } }),
    prisma.addOn.findUniqueOrThrow({ where: { id: addOnId } }),
    prisma.setting.findUniqueOrThrow({ where: { id: 1 } }),
  ])
  if (booking.status !== 'CONFIRMED') throw new BookingIncompleteError('Booking is not confirmed')
  if (!addOn.active || addOn.unit === 'PER_30_MIN') {
    throw new BookingIncompleteError('This extra can’t be added online — give us a call!')
  }

  const qty = Math.max(1, Math.min(50, quantity))
  const line = addOnLineTotal(addOn.unit, addOn.price, booking.partySize, qty)
  const sc = addOn.serviceCharge ? applyPercent(line, setting.serviceChargePct) : 0
  const tax = Math.round((line * setting.taxPct) / 100)
  const delta = line + sc + tax

  await prisma.$transaction(async (tx) => {
    const existing = await tx.bookingAddOn.findUnique({
      where: { bookingId_addOnId: { bookingId, addOnId } },
    })
    if (existing) {
      await tx.bookingAddOn.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + qty, lineTotal: existing.lineTotal + line },
      })
    } else {
      await tx.bookingAddOn.create({
        data: { bookingId, addOnId, quantity: qty, unitPrice: addOn.price, lineTotal: line },
      })
    }
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        addOnsTotal: { increment: line },
        serviceCharge: { increment: sc },
        taxAmount: { increment: tax },
        total: { increment: delta },
        balanceDue: { increment: delta },
        balancePaid: false, // new charges reopen the balance
      },
    })
  })

  return { added: addOn.name, delta }
}

/** Staff action: confirm a deposit-paid booking that was held for review. */
export async function approveBooking(id: string) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id } })
  if (booking.status === 'CONFIRMED') return booking
  if (!booking.depositPaid) {
    throw new BookingIncompleteError('Deposit not yet paid')
  }
  return finalizeConfirmed(id)
}
