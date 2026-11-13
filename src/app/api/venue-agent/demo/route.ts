import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseProfile } from '@/lib/venue-agent/profile'
import { runVenueAgent } from '@/lib/venue-agent/run'
import { clientIp, isPreview, messagesSchema, overLimit, venueProductOn } from '@/lib/venue-agent/gate'

// POST /api/venue-agent/demo — a venue owner tries the agent on the setup that
// was just drafted from their website, before anything is saved. Always a
// demo: nothing is ever sent from here, and it's capped harder than a real
// venue's chat because anyone can reach it.
export async function POST(req: NextRequest) {
  if (!venueProductOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (overLimit(`demo:${clientIp(req.headers)}`, 30, 60 * 60_000)) {
    return NextResponse.json({ error: 'That’s the demo limit for now. Try again in an hour.' }, { status: 429 })
  }
  const body = z.object({ profile: z.unknown(), messages: messagesSchema.refine((m) => m.length <= 20) }).safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  let profile
  try {
    profile = parseProfile(body.data.profile)
  } catch (e) {
    return NextResponse.json({ error: `The setup has a problem: ${e instanceof Error ? e.message.slice(0, 300) : 'invalid'}` }, { status: 400 })
  }
  try {
    const r = await runVenueAgent(profile, body.data.messages, { mode: 'dry' })
    console.log('[venue-agent] demo turn', { venue: profile.slug, tools: r.toolsUsed, ...r.usage })
    return NextResponse.json(isPreview() ? { reply: r.reply, usage: r.usage } : { reply: r.reply })
  } catch (e) {
    console.error('[venue-agent] demo failed', e)
    return NextResponse.json({ error: 'The demo is unavailable right now.' }, { status: 502 })
  }
}
