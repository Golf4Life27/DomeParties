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

/** Instant auto-response to a new inquiry (speed-to-lead). */
export function buildLeadAutoResponse(data: { name: string; eventType: string }) {
  const subject = `We got your event request! — Whitetail Ridge Golf Dome`
  const text = `Hi ${data.name},

Thanks for your interest in hosting your ${data.eventType.toLowerCase()} event at
Whitetail Ridge Golf Dome! 🏌️

We've received your request and a member of our events team will reach out shortly
with a custom proposal. We typically respond within one business day.

In the meantime, reply to this email with any questions.

— The Whitetail Ridge Golf Dome events team
Oswego, IL`

  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">
  <h1 style="color:#0b6e4f">We got your request! 🎉</h1>
  <p>Hi ${data.name}, thanks for your interest in hosting your
  <strong>${data.eventType.toLowerCase()}</strong> event at Whitetail Ridge Golf Dome.</p>
  <p>A member of our events team will reach out shortly with a custom proposal — we
  typically respond within one business day.</p>
  <p>Questions in the meantime? Just reply to this email.</p>
  <p style="color:#666">— The Whitetail Ridge Golf Dome events team · Oswego, IL</p>
</div>`
  return { subject, html, text }
}

/** Email a customer their custom quote + a one-click deposit link. */
export function buildQuoteEmail(data: {
  name: string
  reference: string
  total: number
  depositAmount: number
  payUrl: string
  message?: string | null
}) {
  const subject = `Your event quote ${data.reference} — Whitetail Ridge Golf Dome`
  const text = `Hi ${data.name},

Your custom event quote is ready!

Reference: ${data.reference}
Total: ${formatCents(data.total)}
Deposit to lock your date: ${formatCents(data.depositAmount)}
${data.message ? `\n${data.message}\n` : ''}
Reserve your date by paying the deposit here:
${data.payUrl}

We can't wait to host you!
— Whitetail Ridge Golf Dome, Oswego, IL`

  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">
  <h1 style="color:#0b6e4f">Your event quote is ready 🎉</h1>
  <p>Hi ${data.name}, here's your custom quote for Whitetail Ridge Golf Dome.</p>
  ${data.message ? `<p>${data.message}</p>` : ''}
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:6px 0;color:#666">Reference</td><td style="text-align:right"><strong>${data.reference}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#666">Total</td><td style="text-align:right">${formatCents(data.total)}</td></tr>
    <tr><td style="padding:6px 0;color:#0b6e4f">Deposit to reserve</td><td style="text-align:right;color:#0b6e4f"><strong>${formatCents(data.depositAmount)}</strong></td></tr>
  </table>
  <p style="text-align:center;margin:28px 0">
    <a href="${data.payUrl}" style="background:#f4a300;color:#064233;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:bold">Reserve your date →</a>
  </p>
  <p style="color:#666">— Whitetail Ridge Golf Dome, Oswego, IL</p>
</div>`
  return { subject, html, text }
}
