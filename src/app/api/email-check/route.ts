import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { prisma } from '@/lib/db'
import { sendEmail, splitRecipients } from '@/lib/email'

// Preview-only diagnostic: checks whether the dome Gmail login still works and
// whether the Resend backup can deliver one test alert to the staff list.
// 404s everywhere except a Vercel preview deployment. Never returns secrets.
export const dynamic = 'force-dynamic'

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const out: Record<string, unknown> = {}
  const from = process.env.EMAIL_FROM ?? ''
  out.emailFromDomain = from.split('@')[1]?.replace(/>.*$/, '') ?? null
  out.gmailUserDomain = process.env.GMAIL_USER?.split('@')[1] ?? null
  out.hasResendKey = Boolean(process.env.RESEND_API_KEY)

  // 1. Gmail login check only (sends nothing).
  try {
    const t = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER ?? '',
        pass: (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, ''),
      },
    })
    await t.verify()
    out.gmailLogin = 'ok'
  } catch (e) {
    out.gmailLogin = `failed: ${(e as Error).message.split('\n')[0]}`
  }

  // 2. One test alert to the staff list through the normal sender.
  const setting = await prisma.setting.findUnique({ where: { id: 1 } })
  const to = splitRecipients(setting?.staffNotifyEmail)
  out.staffListCount = to.length
  if (to.length) {
    out.testSend = await sendEmail({
      to,
      subject: 'TEST: party site alerts are working again (no action needed)',
      html: '<p>This is a one-time test from the party site. New lead alerts can reach you again. No action needed.</p>',
      text: 'This is a one-time test from the party site. New lead alerts can reach you again. No action needed.',
    })
  }

  // 3. What the failed alerts were about: leads and bookings since Oct 25.
  const since = new Date('2026-10-25T00:00:00Z')
  out.leads = await prisma.lead.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: {
      createdAt: true, customerName: true, eventType: true, headcountMin: true,
      headcountMax: true, preferredDate: true, dateFlexible: true, status: true,
      source: true, message: true, utmCampaign: true,
    },
  })
  out.bookings = await prisma.booking.findMany({
    where: { updatedAt: { gte: since }, status: { not: 'DRAFT' } },
    orderBy: { updatedAt: 'asc' },
    select: {
      reference: true, status: true, eventType: true, date: true, partySize: true,
      customerName: true, createdAt: true, updatedAt: true,
    },
  })
  return NextResponse.json(out)
}
