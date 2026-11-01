import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseProfile } from '@/lib/venue-agent/profile'
import { clientIp, isPreview, overLimit, venueProductOn } from '@/lib/venue-agent/gate'

// POST /api/venue-agent/signup — the owner checked their setup and wants it
// live. The setup goes to the product inbox (VENUE_AGENT_SIGNUP_INBOX), from
// the product's own sending address, never the dome's. Nothing is sent from a
// preview copy or when no inbox is set up.
export async function POST(req: NextRequest) {
  if (!venueProductOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (overLimit(`signup:${clientIp(req.headers)}`, 5, 60 * 60_000)) return NextResponse.json({ error: 'Too many tries.' }, { status: 429 })
  const body = z
    .object({ profile: z.unknown(), name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(200), plan: z.enum(['founding']).default('founding'), fixes: z.string().trim().max(1000).default('') })
    .safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Add your name and email.' }, { status: 400 })
  let profile
  try {
    profile = parseProfile(body.data.profile)
  } catch {
    return NextResponse.json({ error: 'The setup has a problem. Fix the highlighted parts and try again.' }, { status: 400 })
  }
  const key = process.env.VENUE_AGENT_RESEND_KEY
  const from = process.env.VENUE_AGENT_EMAIL_FROM
  const inbox = process.env.VENUE_AGENT_SIGNUP_INBOX
  if (isPreview() || !key || !from || !inbox) {
    return NextResponse.json({ ok: true, demo: true, message: 'Demo only: nothing was sent.' })
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [inbox],
      reply_to: body.data.email,
      subject: `New venue signup: ${profile.name} (${body.data.plan})`,
      text: `${body.data.name} <${body.data.email}> wants ${profile.name} live on the ${body.data.plan} plan.\n\nFixes they asked for: ${body.data.fixes || '(none)'}\n\nSetup:\n${JSON.stringify(profile, null, 2)}`,
    }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  if (!res?.ok) return NextResponse.json({ error: 'That didn’t go through. Try again in a minute.' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
