import { formatCents } from '@/lib/money'
import { minutesToLabel } from '@/lib/time'

type EmailInput = {
  to: string
  subject: string
  html: string
  text: string
  icsContent?: string
}

/**
 * Send an email via Resend when RESEND_API_KEY is set; otherwise log to the
 * server console (dev fallback) so the flow is fully testable without keys.
 */
export async function sendEmail(input: EmailInput): Promise<{ ok: boolean; mode: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'Whitetail Ridge Golf Dome <events@example.com>'

  if (!apiKey) {
    console.log('\n========== [DEV EMAIL] ==========')
    console.log('From:', from)
    console.log('To:', input.to)
    console.log('Subject:', input.subject)
    console.log('---- text ----')
    console.log(input.text)
    if (input.icsContent) console.log('---- (calendar .ics attached) ----')
    console.log('=================================\n')
    return { ok: true, mode: 'console' }
  }

  const attachments = input.icsContent
    ? [
        {
          filename: 'whitetail-ridge-event.ics',
          content: Buffer.from(input.icsContent).toString('base64'),
        },
      ]
    : undefined

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments,
    }),
  })
  return { ok: res.ok, mode: 'resend' }
}

type ConfirmationData = {
  reference: string
  customerName: string
  dateStr: string
  startMinutes: number
  endMinutes: number
  partySize: number
  packageName: string
  total: number
  depositAmount: number
  balanceDue: number
}

/** Build an RFC5545 calendar invite for the event. */
export function buildIcs(data: ConfirmationData): string {
  const [y, m, d] = data.dateStr.split('-').map(Number)
  const pad = (n: number) => n.toString().padStart(2, '0')
  const toStamp = (mins: number) =>
    `${y}${pad(m)}${pad(d)}T${pad(Math.floor(mins / 60))}${pad(mins % 60)}00`
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Whitetail Ridge Golf Dome//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${data.reference}@whitetailridgedome.com`,
    `SUMMARY:Your event at Whitetail Ridge Golf Dome (${data.reference})`,
    `DTSTART:${toStamp(data.startMinutes)}`,
    `DTEND:${toStamp(data.endMinutes)}`,
    'LOCATION:Whitetail Ridge Golf Dome, Oswego, IL',
    `DESCRIPTION:${data.packageName} for ${data.partySize} guests. Balance due: ${formatCents(data.balanceDue)}.`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

export function buildConfirmationEmail(data: ConfirmationData) {
  const timeRange = `${minutesToLabel(data.startMinutes)} – ${minutesToLabel(data.endMinutes)}`
  const text = `You're booked! 🎉

Reference: ${data.reference}
Guest: ${data.customerName}
Date: ${data.dateStr}
Time: ${timeRange}
Party size: ${data.partySize}
Package: ${data.packageName}

Total: ${formatCents(data.total)}
Deposit paid: ${formatCents(data.depositAmount)}
Balance due: ${formatCents(data.balanceDue)}

We can't wait to host you at Whitetail Ridge Golf Dome in Oswego, IL!
Questions? Just reply to this email.`

  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">
  <h1 style="color:#0f5132">You're booked! 🎉</h1>
  <p>Hi ${data.customerName}, your event at <strong>Whitetail Ridge Golf Dome</strong> is confirmed.</p>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:6px 0;color:#666">Reference</td><td style="text-align:right"><strong>${data.reference}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#666">Date</td><td style="text-align:right">${data.dateStr}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Time</td><td style="text-align:right">${timeRange}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Party size</td><td style="text-align:right">${data.partySize}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Package</td><td style="text-align:right">${data.packageName}</td></tr>
  </table>
  <hr/>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:6px 0">Total</td><td style="text-align:right">${formatCents(data.total)}</td></tr>
    <tr><td style="padding:6px 0;color:#0f5132">Deposit paid</td><td style="text-align:right;color:#0f5132"><strong>${formatCents(data.depositAmount)}</strong></td></tr>
    <tr><td style="padding:6px 0">Balance due (at event)</td><td style="text-align:right">${formatCents(data.balanceDue)}</td></tr>
  </table>
  <p style="margin-top:24px">We can't wait to host you! 🏌️ Questions? Just reply to this email.</p>
</div>`

  return { subject: `You're booked! ${data.reference} — Whitetail Ridge Golf Dome`, html, text }
}
