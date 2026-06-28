import { NextRequest, NextResponse } from 'next/server'
import { sendRecoveryEmailsToStaleDrafts } from '@/lib/booking'

// POST /api/cron/recovery — send abandoned-cart recovery emails to stale drafts.
// Protect with CRON_SECRET when set (e.g. Vercel Cron passes it as a header/query).
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const provided = req.headers.get('x-cron-key') || req.nextUrl.searchParams.get('key')
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  const minutes = parseInt(req.nextUrl.searchParams.get('minutes') || '60', 10)
  const result = await sendRecoveryEmailsToStaleDrafts(minutes)
  return NextResponse.json({ ok: true, ...result })
}
