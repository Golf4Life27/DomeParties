import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { sendEmail, buildLeadAutoResponse } from '@/lib/email'
import { notifyStaff } from '@/lib/booking'
import { readAttribution } from '@/lib/attribution'
import { sendMetaEvent } from '@/lib/meta'

const schema = z.object({
  eventType: z.enum(['BIRTHDAY', 'GROUP', 'CORPORATE', 'LEAGUE', 'BACHELOR', 'OTHER']).default('CORPORATE'),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dateFlexible: z.boolean().default(false),
  headcountMin: z.number().int().min(1).max(1000).optional().nullable(),
  headcountMax: z.number().int().min(1).max(1000).optional().nullable(),
  budget: z.string().max(100).optional().nullable(),
  mustHaves: z.array(z.string()).default([]),
  customerName: z.string().min(1).max(120),
  customerEmail: z.string().email(),
  customerPhone: z.string().max(40).optional().nullable(),
  message: z.string().max(2000).optional().nullable(),
  // Where the lead came from. Constrained rather than free text so a public
  // endpoint can't write arbitrary strings into the admin lead list.
  source: z.enum(['website', 'chatbot']).default('website'),
})

// POST /api/leads — public inquiry capture + instant auto-response.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  const d = parsed.data
  // First-touch attribution from the visitor's cookie — this is what lets the
  // admin say "the holiday ad earned this lead" instead of just "a lead arrived".
  const attr = readAttribution(req)
  const lead = await prisma.lead.create({
    data: {
      eventType: d.eventType,
      preferredDate: d.preferredDate ? new Date(`${d.preferredDate}T00:00:00.000Z`) : null,
      dateFlexible: d.dateFlexible,
      headcountMin: d.headcountMin ?? null,
      headcountMax: d.headcountMax ?? null,
      budget: d.budget ?? null,
      mustHaves: d.mustHaves,
      customerName: d.customerName,
      customerEmail: d.customerEmail,
      customerPhone: d.customerPhone ?? null,
      message: d.message ?? null,
      source: d.source,
      ...attr,
    },
    select: { id: true },
  })

  // Server-side Lead event to Meta (survives ad blockers; deduped against the
  // browser pixel by event_id = lead.id). Fire-and-forget by contract: it logs
  // failures and never throws.
  await sendMetaEvent({
    eventName: 'Lead',
    eventId: lead.id,
    email: d.customerEmail,
    phone: d.customerPhone,
    fbclid: attr.fbclid,
    sourceUrl: attr.landingPath ? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}${attr.landingPath}` : undefined,
    clientIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent'),
  })

  // Speed-to-lead: fire the instant auto-response (don't block on email failure).
  const email = buildLeadAutoResponse({ name: d.customerName, eventType: d.eventType })
  try {
    await sendEmail({ to: d.customerEmail, subject: email.subject, html: email.html, text: email.text })
  } catch (e) {
    console.error('lead auto-response failed', e)
  }

  await notifyStaff({
    title: `New event lead — ${d.customerName}${d.source === 'chatbot' ? ' (via Birdie)' : ''}`,
    lines: [
      `${d.eventType} · ${d.headcountMin ?? '?'}–${d.headcountMax ?? '?'} guests · ${d.budget ?? 'no budget given'}`,
      `${d.customerEmail}${d.customerPhone ? ` · ${d.customerPhone}` : ''}`,
      'Speed-to-lead wins events — reply fast and send a quote from the lead page.',
    ],
    adminPath: `/admin/leads/${lead.id}`,
    urgent: true,
  })

  return NextResponse.json({ ok: true, id: lead.id }, { status: 201 })
}
