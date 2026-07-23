import { NextRequest, NextResponse } from 'next/server'
import {
  sendRecoveryEmailsToStaleDrafts,
  releaseExpiredHolds,
  sendEventReminders,
  sendLeadFollowUps,
  escalateStaleReviews,
  sendBalanceReminders,
  sendMorningDigest,
  completePastEvents,
} from '@/lib/booking'
import { scanConflictsAndAlert } from '@/lib/trackman'

// Abandoned-cart recovery for stale drafts. Protected by CRON_SECRET when set.
// Accepts POST (manual) and GET (Vercel Cron fires GET with an Authorization
// bearer of CRON_SECRET). Also accepts ?key= or x-cron-key for other schedulers.
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    // Fail closed: an open cron endpoint lets outsiders drive the email cadence.
    return NextResponse.json(
      { error: 'CRON_SECRET is not set — add it in Vercel env vars to enable scheduled jobs.' },
      { status: 401 },
    )
  }
  if (secret) {
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const provided = bearer || req.headers.get('x-cron-key')
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  const minutes = parseInt(req.nextUrl.searchParams.get('minutes') || '60', 10)
  const holds = await releaseExpiredHolds() // free bays from abandoned checkouts first
  const result = await sendRecoveryEmailsToStaleDrafts(minutes)
  const reminders = await sendEventReminders() // T-7 upsell + T-1 logistics
  const followUps = await sendLeadFollowUps() // 24h nurture for unanswered leads
  const escalations = await escalateStaleReviews() // stuck review queue → re-alert staff
  const balances = await sendBalanceReminders() // T-3 settle-up email
  const digest = await sendMorningDigest() // today's run sheet for staff
  const completed = await completePastEvents() // auto-complete + thank-you/review ask
  const conflicts = await scanConflictsAndAlert() // Trackman capacity conflicts
  return NextResponse.json({
    ok: true,
    ...result,
    ...holds,
    ...reminders,
    ...followUps,
    ...escalations,
    ...balances,
    ...digest,
    ...completed,
    ...conflicts,
  })
}

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}
