import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { sendEmail, buildLeadAutoResponse } from '@/lib/email'
import { notifyStaff } from '@/lib/booking'

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
})

// POST /api/leads — public inquiry capture + instant auto-response.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  const d = parsed.data
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
      source: 'website',
    },
    select: { id: true },
  })

  // Speed-to-lead: fire the instant auto-response (don't block on email failure).
  const email = buildLeadAutoResponse({ name: d.customerName, eventType: d.eventType })
  try {
    await sendEmail({ to: d.customerEmail, subject: email.subject, html: email.html, text: email.text })
  } catch (e) {
    console.error('lead auto-response failed', e)
  }

  await notifyStaff({
    title: `New event lead — ${d.customerName}`,
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
