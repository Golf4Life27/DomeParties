import { NextRequest, NextResponse } from 'next/server'
import { listPilotVenues } from '@/venues'
import { isPreview, venueProductOn } from '@/lib/venue-agent/gate'
import { monthlyStatement, monthOf } from '@/lib/venue-agent/pilot'
import { dbPilotStore } from '@/lib/venue-agent/pilot-store'

// On the 1st of each month, emails every pilot venue the list of party
// requests counted last month, so they can check it against their own inbox.
// Sent from the product's own address, never the dome's. Does nothing in a
// preview, while the venue product is off, or when no venue is on the pilot.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || req.headers.get('x-cron-key')
  if (!secret || provided !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isPreview() || !venueProductOn()) return NextResponse.json({ sent: 0, note: 'venue product off' })

  const key = process.env.VENUE_AGENT_RESEND_KEY
  const from = process.env.VENUE_AGENT_EMAIL_FROM
  const now = new Date()
  const results: { venue: string; month: string; count: number; sent: boolean }[] = []
  for (const v of listPilotVenues()) {
    if (!v.handoff.email) continue
    // Last month in the venue's own time zone.
    const [y, m] = monthOf(v, now).split('-').map(Number)
    const month = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
    const rows = await dbPilotStore.since(v.slug, new Date(now.getTime() - 45 * 86_400_000))
    const s = monthlyStatement(v, month, rows)
    // A month before the pilot started has nothing to list.
    if (v.pilot && month < v.pilot.startDate.slice(0, 7)) continue
    let sent = false
    if (key && from) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [v.handoff.email], subject: s.subject, text: s.text }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null)
      sent = !!res?.ok
    }
    results.push({ venue: v.slug, month, count: s.count, sent })
  }
  return NextResponse.json({ sent: results.filter((r) => r.sent).length, results })
}
