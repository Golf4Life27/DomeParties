import { prisma } from '@/lib/db'
import { sendEmail, type EmailInput } from '@/lib/email'

// Outage safety net.
//
// During the Nov 2026 email outage the site kept taking inquiries while every
// alert and auto-reply silently failed, so nobody knew a 300-guest request had
// come in. Emails that must not be lost now go through sendEmailOrHold: if the
// send fails, the email is kept in EmailOutbox and the hourly cron retries it,
// staff see a red banner on the Overview, and (when ALERT_WEBHOOK_URL is set)
// a short alert goes to that backup channel, e.g. a text-message automation.

const MAX_ATTEMPTS = 72 // hourly retries for three days, then stop and keep showing it
const ALERT_EVERY_MS = 3 * 3_600_000

export type HeldKind = 'staff-alert' | 'lead-auto-reply' | 'quote' | 'booking-confirmation' | 'deposit-received'

const toList = (to: string | string[]) => (Array.isArray(to) ? to : [to])

/** Send now; if that fails, hold the email for the hourly retry. Never throws. */
export async function sendEmailOrHold(kind: HeldKind, input: EmailInput): Promise<{ ok: boolean; held: boolean }> {
  let ok = false
  try {
    ok = (await sendEmail(input)).ok
  } catch (e) {
    console.error(`[email-outbox] send threw (${kind})`, e)
  }
  if (ok) return { ok: true, held: false }
  try {
    await prisma.emailOutbox.create({
      data: {
        kind,
        to: toList(input.to),
        subject: input.subject,
        html: input.html,
        text: input.text,
        icsContent: input.icsContent ?? null,
        nextAttemptAt: new Date(Date.now() + 55 * 60_000),
      },
    })
    await alertBackupChannel(kind)
    return { ok: false, held: true }
  } catch (e) {
    console.error(`[email-outbox] could not hold email (${kind})`, e)
    return { ok: false, held: false }
  }
}

/** Retry held emails, oldest first. Runs from the hourly cron. */
export async function flushEmailOutbox() {
  const due = await prisma.emailOutbox.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })
  let sent = 0
  let stillHeld = 0
  for (const m of due) {
    // Staff should know an alert is late, so its timing isn't misread.
    const subject = m.kind === 'staff-alert' && !m.subject.startsWith('[Delayed]') ? `[Delayed] ${m.subject}` : m.subject
    let ok = false
    try {
      ok = (await sendEmail({ to: m.to, subject, html: m.html, text: m.text, icsContent: m.icsContent ?? undefined })).ok
    } catch (e) {
      console.error('[email-outbox] retry threw', m.id, e)
    }
    if (ok) {
      await prisma.emailOutbox.update({ where: { id: m.id }, data: { status: 'SENT', sentAt: new Date() } })
      sent++
      continue
    }
    const attempts = m.attempts + 1
    await prisma.emailOutbox.update({
      where: { id: m.id },
      data: {
        attempts,
        status: attempts >= MAX_ATTEMPTS ? 'GAVE_UP' : 'PENDING',
        nextAttemptAt: new Date(Date.now() + 55 * 60_000),
      },
    })
    stillHeld++
  }
  if (stillHeld > 0) await alertBackupChannel('retry')
  return { heldEmailsSent: sent, heldEmailsStillFailing: stillHeld }
}

export type EmailHealth = {
  failing: boolean
  held: number
  gaveUp: number
  oldestHeldAt: Date | null
  lastOkAt: Date | null
  lastFailAt: Date | null
}

/** Counts only, no addresses or content: safe for the public health check. */
export async function getEmailHealth(): Promise<EmailHealth> {
  const [setting, held, gaveUp, oldest] = await Promise.all([
    prisma.setting.findUnique({ where: { id: 1 }, select: { emailLastOkAt: true, emailLastFailAt: true } }),
    prisma.emailOutbox.count({ where: { status: 'PENDING' } }),
    // A give-up stays visible for a week, then stops holding the banner up.
    prisma.emailOutbox.count({ where: { status: 'GAVE_UP', updatedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
    prisma.emailOutbox.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ])
  const lastOkAt = setting?.emailLastOkAt ?? null
  const lastFailAt = setting?.emailLastFailAt ?? null
  const failing = Boolean(lastFailAt && (!lastOkAt || lastFailAt > lastOkAt)) || held > 0 || gaveUp > 0
  return { failing, held, gaveUp, oldestHeldAt: oldest?.createdAt ?? null, lastOkAt, lastFailAt }
}

/**
 * Tell staff another way that email is down. Posts a short, content-free JSON
 * message to ALERT_WEBHOOK_URL (any automation that texts or calls), at most
 * once every three hours. Does nothing when the variable is unset.
 */
async function alertBackupChannel(reason: string) {
  const url = process.env.ALERT_WEBHOOK_URL
  if (!url) return
  try {
    const s = await prisma.setting.findUnique({ where: { id: 1 }, select: { emailFailAlertAt: true } })
    if (s?.emailFailAlertAt && Date.now() - s.emailFailAlertAt.getTime() < ALERT_EVERY_MS) return
    const held = await prisma.emailOutbox.count({ where: { status: 'PENDING' } })
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Dome party site: emails are failing. ${held} email${held === 1 ? ' is' : 's are'} held and will retry hourly. Check the staff Overview.`,
        held,
        reason,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) await prisma.setting.update({ where: { id: 1 }, data: { emailFailAlertAt: new Date() } })
  } catch (e) {
    console.error('[email-outbox] backup alert failed', e)
  }
}
