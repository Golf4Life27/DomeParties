import { prisma } from '@/lib/db'
import { notifyStaff } from '@/lib/notify'
import { formatCents } from '@/lib/money'
import { todayStr } from '@/lib/time'

// ---------------------------------------------------------------------------
// Annual accounts: relationships that come back every year, and the nudge that
// makes sure somebody reaches out before they go looking elsewhere.
//
// The failure this exists to prevent is specific. These events are bought by a
// SEAT, not a person — committee chair, booster president, HR manager — and the
// seat turns over. The incoming chair inherits a folder, not a relationship, and
// re-opens the venue question from scratch. Nobody has a bad experience; the
// booking just quietly goes somewhere else. At $8–15k an event that is the most
// expensive silence in the business.
// ---------------------------------------------------------------------------

/** How far ahead of the event month to prompt the call. */
const OUTREACH_LEAD_WEEKS = 10

/** Don't re-nudge the same account for at least this long after one is sent. */
const OUTREACH_COOLDOWN_DAYS = 120

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthName(m: number | null | undefined): string | null {
  return m && m >= 1 && m <= 12 ? MONTHS[m - 1] : null
}

/**
 * The next date staff should be prompted about an account whose event lands in
 * `typicalMonth` — roughly OUTREACH_LEAD_WEEKS before the 1st of that month, and
 * always in the future so a month that has already passed rolls to next year.
 */
export function computeNextOutreach(typicalMonth: number | null | undefined, from = new Date()): Date | null {
  if (!typicalMonth || typicalMonth < 1 || typicalMonth > 12) return null
  const leadMs = OUTREACH_LEAD_WEEKS * 7 * 86_400_000
  // Scan two years out, not one. This is called again right after a nudge fires,
  // when the nudge for the NEXT event has itself just gone past — with a
  // one-year window that case falls through and returns a date in the past, so
  // the account never rolls forward and re-nudges once the cooldown lapses.
  for (let yearOffset = 0; yearOffset <= 2; yearOffset++) {
    const eventStart = Date.UTC(from.getUTCFullYear() + yearOffset, typicalMonth - 1, 1)
    const nudge = new Date(eventStart - leadMs)
    if (nudge > from) return nudge
  }
  return null // unreachable while the lead time is under a year
}

/**
 * Cron: alert staff about accounts whose outreach window has arrived.
 *
 * One email per account rather than a digest — these are individually worth four
 * or five figures, and a line item in a list gets skimmed past in a way a subject
 * line with the organisation's name does not.
 */
export async function sendAccountOutreachNudges(): Promise<{ nudged: number }> {
  const now = new Date()
  const cooldown = new Date(now.getTime() - OUTREACH_COOLDOWN_DAYS * 86_400_000)

  const due = await prisma.account.findMany({
    where: {
      active: true,
      nextOutreachOn: { not: null, lte: now },
      OR: [{ lastOutreachSent: null }, { lastOutreachSent: { lt: cooldown } }],
    },
    take: 50,
  })

  for (const a of due) {
    const who = a.organization ? `${a.organization} — ${a.contactName}` : a.contactName
    const month = monthName(a.typicalMonth)
    const lines: string[] = []

    if (a.lastEventOn || a.lastEventValue) {
      lines.push(
        [
          a.lastEventOn ? `Last event ${a.lastEventOn.toISOString().slice(0, 10)}` : null,
          a.lastEventValue ? formatCents(a.lastEventValue) : null,
          a.lastHeadcount ? `${a.lastHeadcount} guests` : null,
          a.timesBooked > 1 ? `booked ${a.timesBooked}×` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      )
    }
    if (month) lines.push(`Their event usually lands in ${month} — they'll be choosing a venue about now.`)
    if (a.contactRole) {
      lines.push(
        `Contact was ${a.contactName}, ${a.contactRole}. Check they still hold that seat — these roles rotate, and a new chair starts from scratch.`,
      )
    }
    const reach = [a.email, a.phone].filter(Boolean).join(' · ')
    if (reach) lines.push(reach)
    if (a.notes) lines.push(`Notes: ${a.notes}`)
    if (a.relationshipOwner) lines.push(`Relationship owner: ${a.relationshipOwner}`)

    await notifyStaff({
      title: `Time to reach out — ${who}`,
      lines,
      adminPath: `/admin/accounts`,
      // Not urgent-red: this is a prompt to make a call, not a problem to fix.
      urgent: false,
    })

    await prisma.account.update({
      where: { id: a.id },
      data: {
        lastOutreachSent: now,
        // Roll the prompt forward a year so the account keeps nudging annually
        // without anyone re-entering it.
        nextOutreachOn: computeNextOutreach(a.typicalMonth, now),
      },
    })
  }

  return { nudged: due.length }
}

/** Accounts whose outreach window is open now — surfaced at the top of the admin list. */
export async function dueNow() {
  return prisma.account.findMany({
    where: { active: true, nextOutreachOn: { not: null, lte: new Date(`${todayStr()}T23:59:59.999Z`) } },
    orderBy: { nextOutreachOn: 'asc' },
  })
}
