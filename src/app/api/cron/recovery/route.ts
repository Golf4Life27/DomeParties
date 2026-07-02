import { NextRequest, NextResponse } from 'next/server'
import { sendRecoveryEmailsToStaleDrafts, releaseExpiredHolds } from '@/lib/booking'

// Abandoned-cart recovery for stale drafts. Protected by CRON_SECRET when set.
// Accepts POST (manual) and GET (Vercel Cron fires GET with an Authorization
// bearer of CRON_SECRET). Also accepts ?key= or x-cron-key for other schedulers.
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const provided = bearer || req.headers.get('x-cron-key') || req.nextUrl.searchParams.get('key')
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  const minutes = parseInt(req.nextUrl.searchParams.get('minutes') || '60', 10)
  const holds = await releaseExpiredHolds() // free bays from abandoned checkouts first
  const result = await sendRecoveryEmailsToStaleDrafts(minutes)
  return NextResponse.json({ ok: true, ...result, ...holds })
}

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}
