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
    fbp: attr.fbp,
    fbc: attr.fbc,
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

  // The alert carries the WHOLE inquiry, mirroring the admin lead page. It used
  // to send event type, headcount, budget and contact only — so the preferred
  // date, whether that date was flexible, the must-haves and (most valuable of
  // all) what the customer actually wrote were visible only after opening the
  // admin. Reading a lead on a phone should not require a second device.
  const headcount =
    d.headcountMin || d.headcountMax
      ? `${d.headcountMin ?? '?'}–${d.headcountMax ?? '?'} guests`
      : 'headcount not given'
  const preferredDate = d.preferredDate
    ? `${d.preferredDate}${d.dateFlexible ? ' (flexible)' : ' (fixed)'}`
    : d.dateFlexible
      ? 'none given — flexible'
      : 'none given'
  // Which ad earned this lead, when we know. Omitted rather than shown empty:
  // an organic inquiry shouldn't grow a row that says nothing.
  const attributionLine =
    [attr.utmSource, attr.utmMedium, attr.utmCampaign].filter(Boolean).join(' / ') ||
    (attr.fbclid ? 'Meta ad click' : null)

  await notifyStaff({
    title: `New event lead — ${d.customerName}${d.source === 'chatbot' ? ' (via Birdie)' : ''}`,
    lines: [
      `${d.eventType} · ${headcount} · ${d.budget ?? 'no budget given'}`,
      `Preferred date: ${preferredDate}`,
      `Must-haves: ${d.mustHaves.length ? d.mustHaves.join(', ') : 'none listed'}`,
      `Contact: ${d.customerEmail}${d.customerPhone ? ` · ${d.customerPhone}` : ''}`,
      ...(attributionLine ? [`Came from: ${attributionLine}`] : []),
      'Speed-to-lead wins events — reply fast and send a quote from the lead page.',
    ],
    note: d.message ? { label: 'What they wrote', body: d.message } : null,
    contact: { email: d.customerEmail, phone: d.customerPhone },
    adminPath: `/admin/leads/${lead.id}`,
    urgent: true,
  })

  return NextResponse.json({ ok: true, id: lead.id }, { status: 201 })
}
