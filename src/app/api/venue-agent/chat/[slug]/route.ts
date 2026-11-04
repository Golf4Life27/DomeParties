import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVenue } from '@/venues'
import { runVenueAgent } from '@/lib/venue-agent/run'
import { clientIp, isPreview, messagesSchema, overLimit, venueProductOn } from '@/lib/venue-agent/gate'

// POST /api/venue-agent/chat/<venue> — a venue's website chat. Off unless the
// venue product is switched on; then it answers "not found" for venues that
// aren't set up.

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const venue = venueProductOn() ? getVenue(slug) : null
  if (!venue) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (overLimit(`chat:${slug}:${clientIp(req.headers)}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many messages. Try again in a few minutes.' }, { status: 429 })
  }
  const body = z.object({ messages: messagesSchema }).safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  try {
    const preview = isPreview() || venue.sample || venue.prospect
    const r = await runVenueAgent(venue, body.data.messages, { mode: preview ? 'dry' : 'live' })
    console.log('[venue-agent] turn', { venue: slug, tools: r.toolsUsed, ...r.usage, cutOff: r.cutOff })
    return NextResponse.json(isPreview() ? { reply: r.reply, usage: r.usage, tools: r.toolsUsed } : { reply: r.reply })
  } catch (e) {
    console.error('[venue-agent] failed', e)
    return NextResponse.json({ error: 'The chat is unavailable right now.' }, { status: 502 })
  }
}
