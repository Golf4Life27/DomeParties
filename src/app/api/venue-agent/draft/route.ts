import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { draftFromPasted, draftFromSite, MAX_PASTED_CHARS, PastedError } from '@/lib/venue-agent/draft'
import { SiteError } from '@/lib/venue-agent/read-site'
import { clientIp, isPreview, overLimit, venueProductOn } from '@/lib/venue-agent/gate'

// POST /api/venue-agent/draft — step one of setup. The owner gives only a
// website address; this reads the site and drafts the whole setup for them.
// If their site blocks the reader (or they have none), they paste their party
// page or price list, or upload a PDF of it, and the same draft comes back.
export const maxDuration = 120

export async function POST(req: NextRequest) {
  if (!venueProductOn()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (overLimit(`draft:${clientIp(req.headers)}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: 'That’s a few setups in a row. Try again in an hour.' }, { status: 429 })
  }
  const body = z
    .object({
      website: z.string().trim().max(300).nullable().default(null),
      email: z.string().trim().email().max(200).nullable().default(null),
      text: z.string().max(MAX_PASTED_CHARS + 1000).nullable().default(null),
      pdfBase64: z.string().max(4_400_000).nullable().default(null),
    })
    .safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Give a website address, or paste your party page.' }, { status: 400 })
  const { website, email, text, pdfBase64 } = body.data
  const pasted = Boolean(text?.trim() || pdfBase64?.trim())
  if (!pasted && (website ?? '').length < 4) return NextResponse.json({ error: 'Give a website address.' }, { status: 400 })
  try {
    const d = pasted ? await draftFromPasted({ text, pdfBase64, website }, email) : await draftFromSite(website!, email)
    console.log('[venue-agent] drafted', { venue: d.profile.slug, pages: d.sources.length, ...d.usage })
    return NextResponse.json({ profile: d.profile, unsure: d.unsure, sources: d.sources, ...(isPreview() ? { usage: d.usage } : {}) })
  } catch (e) {
    if (e instanceof SiteError) return NextResponse.json({ error: e.message, canPaste: true }, { status: 422 })
    if (e instanceof PastedError) return NextResponse.json({ error: e.message }, { status: 400 })
    console.error('[venue-agent] draft failed', e)
    const tip = pasted ? 'Try pasting just your parties, prices and hours.' : 'Try the page that lists your parties, or paste it instead.'
    return NextResponse.json({ error: `We couldn’t draft a setup from that. ${tip}`, canPaste: !pasted }, { status: 502 })
  }
}
