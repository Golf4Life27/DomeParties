import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { prisma } from '@/lib/db'
import { splitRecipients } from '@/lib/email'

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

  // 2. One test alert to the staff list through Resend.
  const setting = await prisma.setting.findUnique({ where: { id: 1 } })
  const to = splitRecipients(setting?.staffNotifyEmail)
  out.staffListCount = to.length
  if (process.env.RESEND_API_KEY && to.length) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from || 'Whitetail Ridge Golf Dome <onboarding@resend.dev>',
        to,
        subject: 'TEST: party site alert check (no action needed)',
        text: 'This is a one-time test from the party site to check that staff alerts can reach you. No action needed.',
      }),
    })
    out.resendStatus = res.status
    out.resendBody = (await res.text()).slice(0, 400)
  }
  return NextResponse.json(out)
}
