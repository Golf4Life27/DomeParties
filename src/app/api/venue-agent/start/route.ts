import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseProfile } from '@/lib/venue-agent/profile'
import { clientIp, isPreview, overLimit, venueProductOn } from '@/lib/venue-agent/gate'
import { billingCurrency } from '@/lib/venue-agent/plans'
import { trialToken } from '@/lib/venue-agent/trial-link'

// POST /api/venue-agent/start — the owner's "start my free month": the setup
// just built from their website becomes their own demo link, right away, with
// no person in between. On the live site the product inbox also hears about it
// (from the product's own address, never the dome's). Nothing is ever sent from
// a preview copy. No payment is taken here yet.
export async function POST(req: NextRequest) {
  if (!venueProductOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (overLimit(`start:${clientIp(req.headers)}`, isPreview() ? 40 : 5, 60 * 60_000)) return NextResponse.json({ error: 'Too many tries. Try again in an hour.' }, { status: 429 })
  const body = z.object({ profile: z.unknown(), email: z.string().trim().email().max(200) }).safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Add your email.' }, { status: 400 })
  let profile
  try {
    profile = parseProfile(body.data.profile)
  } catch {
    return NextResponse.json({ error: 'The setup has a problem. Try setting it up again.' }, { status: 400 })
  }
  const owner = { ...profile, prospect: true, handoff: { ...profile.handoff, email: profile.handoff.email || body.data.email } }
  const token = trialToken(owner)
  const link = `${req.nextUrl.origin}/for-venues/trial?t=${token}`
  const key = process.env.VENUE_AGENT_RESEND_KEY
  const from = process.env.VENUE_AGENT_EMAIL_FROM
  const inbox = process.env.VENUE_AGENT_SIGNUP_INBOX
  if (!isPreview() && key && from && inbox) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [inbox],
        reply_to: body.data.email,
        subject: `Free month started: ${owner.name} (${billingCurrency(owner.currency)})`,
        text: `${body.data.email} started a free month for ${owner.name} (${owner.website ?? 'no website'}).\n\nTheir demo link: ${link}\n\nSetup:\n${JSON.stringify(owner, null, 2)}`,
      }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null)
  }
  return NextResponse.json({ ok: true, link, path: `/for-venues/trial?t=${token}`, demo: isPreview() })
}
