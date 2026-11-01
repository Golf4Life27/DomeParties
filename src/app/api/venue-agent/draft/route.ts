import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { draftFromSite } from '@/lib/venue-agent/draft'
import { SiteError } from '@/lib/venue-agent/read-site'
import { clientIp, isPreview, overLimit, venueProductOn } from '@/lib/venue-agent/gate'

// POST /api/venue-agent/draft — step one of setup. The owner gives only a
// website address; this reads the site and drafts the whole setup for them.
export const maxDuration = 120

export async function POST(req: NextRequest) {
  if (!venueProductOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (overLimit(`draft:${clientIp(req.headers)}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: 'That’s a few setups in a row. Try again in an hour.' }, { status: 429 })
  }
  const body = z
    .object({ website: z.string().trim().min(4).max(300), email: z.string().trim().email().max(200).nullable().default(null) })
    .safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Give a website address.' }, { status: 400 })
  try {
    const d = await draftFromSite(body.data.website, body.data.email)
    console.log('[venue-agent] drafted', { venue: d.profile.slug, pages: d.sources.length, ...d.usage })
    return NextResponse.json({ profile: d.profile, unsure: d.unsure, sources: d.sources, ...(isPreview() ? { usage: d.usage } : {}) })
  } catch (e) {
    if (e instanceof SiteError) return NextResponse.json({ error: e.message }, { status: 422 })
    console.error('[venue-agent] draft failed', e)
    return NextResponse.json({ error: 'We couldn’t draft a setup from that website. Try the page that lists your parties.' }, { status: 502 })
  }
}
