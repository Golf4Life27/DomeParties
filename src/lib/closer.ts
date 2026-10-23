// Follow-up closer for party inquiries nobody has answered yet.
//
// Switched off unless LEAD_CLOSER=on. While off, the single 24h follow-up email
// in sendLeadFollowUps() runs exactly as before. While on, it replaces that email
// with three touches:
//   1. ~24h after the inquiry: "still planning it?", with a "yes" button and a
//      "someone already reached out" button. The second marks the lead CONTACTED
//      and stops everything, so a guest Billy already called is never chased.
//   2. Right after a "yes", or after ~2 quiet days: the price for their group and
//      the booking link.
//   3. ~5 days after that, the last one: their date is still open, plus the link.
//
// Only NEW leads are touched, so Billy keeps a lead out by setting it to
// Contacted (or any other status) on the admin lead page. Replies land in the
// sending inbox like any other email. Email only for now: texting waits on a
// dome texting number, and the form's textConsent box is stored so leads from
// now on can be texted once that number exists.
import { prisma } from '@/lib/db'
import { computeQuote } from '@/lib/pricing'
import { sendEmail, buildCloserEmail } from '@/lib/email'
import { signLeadAction } from '@/lib/sign'
import type { EventType, Lead } from '@/generated/prisma'

const DAY = 86_400_000
// Wait after the previous touch before the next one goes out, by step.
const WAIT_MS = [1 * DAY, 2 * DAY, 5 * DAY]

const PARTY: Record<EventType, string> = {
  BIRTHDAY: 'birthday party',
  GROUP: 'group outing',
  CORPORATE: 'corporate event',
  LEAGUE: 'league',
  BACHELOR: 'bachelor or bachelorette party',
  OTHER: 'event',
}

export function closerEnabled(): boolean {
  return process.env.LEAD_CLOSER === 'on'
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

/** Inquiry dates are stored as UTC midnight, so format them in UTC too. */
function dateLabel(d: Date | null): string | null {
  if (!d) return null
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function datePassed(lead: Lead): boolean {
  if (!lead.preferredDate || lead.dateFlexible) return false
  return lead.preferredDate.getTime() + DAY < Date.now()
}

function actionUrl(leadId: string, action: 'yes' | 'allset'): string {
  const { exp, sig } = signLeadAction(leadId, action)
  return `${appUrl()}/api/leads/${encodeURIComponent(leadId)}/closer?a=${action}&exp=${exp}&sig=${sig}`
}

/**
 * Price for the lead's group from the featured package for their event type.
 * Null when there's no headcount or no package fits, and the email then points
 * to the booking page instead of naming a number.
 */
async function priceFor(lead: Lead) {
  const guests = lead.headcountMax ?? lead.headcountMin
  if (!guests) return null
  const pkg = await prisma.package.findFirst({
    where: { active: true, eventType: lead.eventType, minGuests: { lte: guests }, maxGuests: { gte: guests } },
    orderBy: [{ popular: 'desc' }, { sortOrder: 'asc' }],
  })
  if (!pkg) return null
  try {
    const q = await computeQuote({
      partySize: guests,
      packageId: pkg.id,
      addOns: [],
      dateStr: lead.preferredDate ? lead.preferredDate.toISOString().slice(0, 10) : null,
      startMinutes: null,
    })
    return { total: q.total, from: q.estimated, guests, packageName: pkg.name, depositPercent: q.depositPercent }
  } catch (e) {
    console.error('closer price failed for', lead.id, e)
    return null
  }
}

/**
 * Send the lead's next touch. The step is claimed before sending so two cron
 * runs can't both send it; a failed send gives the step back for the next run.
 */
export async function sendCloserTouch(leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead || lead.status !== 'NEW' || lead.closerStoppedAt || lead.closerStep >= 3) return false
  const stage = (lead.closerStep + 1) as 1 | 2 | 3

  const claimed = await prisma.lead.updateMany({
    where: { id: lead.id, closerStep: lead.closerStep, status: 'NEW', closerStoppedAt: null },
    data: { closerStep: stage, closerLastAt: new Date() },
  })
  if (claimed.count === 0) return false

  try {
    const email = buildCloserEmail(stage, {
      name: lead.customerName,
      party: PARTY[lead.eventType],
      dateLabel: dateLabel(lead.preferredDate),
      bookUrl: `${appUrl()}/book`,
      yesUrl: actionUrl(lead.id, 'yes'),
      allSetUrl: actionUrl(lead.id, 'allset'),
      price: stage === 1 ? null : await priceFor(lead),
    })
    await sendEmail({ to: lead.customerEmail, subject: email.subject, html: email.html, text: email.text })
    return true
  } catch (e) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { closerStep: lead.closerStep, closerLastAt: lead.closerLastAt },
    })
    throw e
  }
}

/** Hourly from the cron: send every touch that's due. */
export async function runLeadCloser() {
  const now = Date.now()
  const leads = await prisma.lead.findMany({
    where: {
      status: 'NEW',
      closerStoppedAt: null,
      closerStep: { lt: 3 },
      // Inquiries from the last two weeks only, so switching this on doesn't
      // email a whole season of old leads at once.
      createdAt: { gt: new Date(now - 14 * DAY), lt: new Date(now - DAY) },
    },
    take: 100,
  })
  let sent = 0
  let stopped = 0
  for (const lead of leads) {
    if (datePassed(lead)) {
      await prisma.lead.update({ where: { id: lead.id }, data: { closerStoppedAt: new Date() } })
      stopped++
      continue
    }
    const since = (lead.closerLastAt ?? lead.createdAt).getTime()
    if (since + WAIT_MS[lead.closerStep] > now) continue
    try {
      if (await sendCloserTouch(lead.id)) sent++
    } catch (e) {
      console.error('closer touch failed for', lead.id, e)
    }
  }
  return { closerSent: sent, closerStopped: stopped }
}

/** Guest tapped "yes, still planning": send the price now instead of waiting. */
export async function closerSaidYes(leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { closerStep: true } })
  if (lead?.closerStep !== 1) return false
  return sendCloserTouch(leadId)
}

/** Guest tapped "someone already reached out": hand the lead to staff and stop. */
export async function closerAllSet(leadId: string): Promise<void> {
  await prisma.lead.updateMany({
    where: { id: leadId, closerStoppedAt: null },
    data: { closerStoppedAt: new Date() },
  })
  await prisma.lead.updateMany({ where: { id: leadId, status: 'NEW' }, data: { status: 'CONTACTED' } })
}
