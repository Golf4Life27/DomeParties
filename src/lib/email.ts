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
  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)')
    console.error(`[email] Resend send FAILED (${res.status}) to=${input.to} subject="${input.subject}": ${body}`)
  }
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

export function buildConfirmationEmail(data: ConfirmationData & { manageUrl?: string; inviteUrl?: string }) {
  const timeRange = `${minutesToLabel(data.startMinutes)} – ${minutesToLabel(data.endMinutes)}`
  const extras = data.manageUrl
    ? `

Make it even better:
• Add food, drinks & extras: ${data.manageUrl}
• Invite your guests with one link: ${data.inviteUrl}`
    : ''
  const text = `You're booked! 🎉

Reference: ${data.reference}
Guest: ${data.customerName}
Date: ${data.dateStr}
Time: ${timeRange}
Party size: ${data.partySize}
Package: ${data.packageName}

Total: ${formatCents(data.total)}
Deposit paid: ${formatCents(data.depositAmount)}
Balance due: ${formatCents(data.balanceDue)}${extras}

We can't wait to host you at Whitetail Ridge Golf Dome in Oswego, IL!
Questions? Just reply to this email.`

  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">
  <h1 style="color:#0e1740">You're booked! 🎉</h1>
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
    <tr><td style="padding:6px 0;color:#0e1740">Deposit paid</td><td style="text-align:right;color:#0e1740"><strong>${formatCents(data.depositAmount)}</strong></td></tr>
    <tr><td style="padding:6px 0">Balance due (at event)</td><td style="text-align:right">${formatCents(data.balanceDue)}</td></tr>
  </table>
  ${
    data.manageUrl
      ? `<div style="margin-top:20px;padding:16px;background:#f5fbdd;border-radius:12px">
    <strong style="color:#0e1740">Make it even better 🎈</strong>
    <ul style="margin:8px 0 0">
      <li><a href="${data.manageUrl}">Add food, drinks &amp; extras →</a></li>
      <li><a href="${data.inviteUrl}">Invite your guests with one link →</a></li>
    </ul>
  </div>`
      : ''
  }
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
  <h1 style="color:#0e1740">We got your request! 🎉</h1>
  <p>Hi ${data.name}, thanks for your interest in hosting your
  <strong>${data.eventType.toLowerCase()}</strong> event at Whitetail Ridge Golf Dome.</p>
  <p>A member of our events team will reach out shortly with a custom proposal — we
  typically respond within one business day.</p>
  <p>Questions in the meantime? Just reply to this email.</p>
  <p style="color:#666">— The Whitetail Ridge Golf Dome events team · Oswego, IL</p>
</div>`
  return { subject, html, text }
}

/** Pre-event reminder: T-7 sells extras + balance; T-1 is logistics. */
export function buildReminderEmail(
  data: ConfirmationData & { manageUrl: string; balanceUrl: string; inviteUrl: string },
  kind: 'week' | 'day',
) {
  const timeRange = `${minutesToLabel(data.startMinutes)} – ${minutesToLabel(data.endMinutes)}`
  if (kind === 'week') {
    const subject = `One week to party! 🎉 (${data.reference})`
    const text = `Hi ${data.customerName},

Your event at Whitetail Ridge Golf Dome is one week out — ${data.dateStr}, ${timeRange}.

Make it even better before you arrive:
• Add food, drinks & extras: ${data.manageUrl}
• Invite your guests with one link: ${data.inviteUrl}
${data.balanceDue > 0 ? `• Skip the line — pay your ${formatCents(data.balanceDue)} balance ahead: ${data.balanceUrl}\n` : ''}
See you soon! 🏌️
— Whitetail Ridge Golf Dome, Oswego, IL`
    const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">
  <h1 style="color:#0e1740">One week to party! 🎉</h1>
  <p>Hi ${data.customerName}, your event is <strong>${data.dateStr}, ${timeRange}</strong>.</p>
  <p>Make it even better before you arrive:</p>
  <ul>
    <li><a href="${data.manageUrl}">Add food, drinks &amp; extras →</a></li>
    <li><a href="${data.inviteUrl}">Invite your guests with one link →</a></li>
    ${data.balanceDue > 0 ? `<li><a href="${data.balanceUrl}">Skip the line — pay your ${formatCents(data.balanceDue)} balance ahead →</a></li>` : ''}
  </ul>
  <p style="color:#666">Reference ${data.reference} · Whitetail Ridge Golf Dome, Oswego, IL</p>
</div>`
    return { subject, html, text }
  }
  const subject = `Tomorrow's the day! 🏌️ (${data.reference})`
  const text = `Hi ${data.customerName},

Quick reminder — your event at Whitetail Ridge Golf Dome is tomorrow:
${data.dateStr}, ${timeRange} · ${data.partySize} guests · ${data.packageName}

${data.balanceDue > 0 ? `Balance due: ${formatCents(data.balanceDue)} — pay ahead and skip the line: ${data.balanceUrl}\n\n` : ''}We can't wait to see you!
— Whitetail Ridge Golf Dome · 3360 Station Dr, Oswego, IL`
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">
  <h1 style="color:#0e1740">Tomorrow's the day! 🏌️</h1>
  <p>Hi ${data.customerName}, your event is <strong>tomorrow — ${data.dateStr}, ${timeRange}</strong>
  (${data.partySize} guests, ${data.packageName}).</p>
  ${data.balanceDue > 0 ? `<p><a href="${data.balanceUrl}" style="background:#c8ff2e;color:#0e1740;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">Pay your ${formatCents(data.balanceDue)} balance ahead →</a></p>` : ''}
  <p style="color:#666">3360 Station Dr, Oswego, IL · Reference ${data.reference}</p>
</div>`
  return { subject, html, text }
}

/** Receipt for a paid event balance. */
export function buildBalanceReceiptEmail(data: ConfirmationData) {
  const subject = `Balance paid — you're all set! (${data.reference})`
  const text = `Hi ${data.customerName},

We've received your ${formatCents(data.balanceDue)} balance for ${data.dateStr}. You're fully
paid — just show up and have a great time! 🎉

Reference: ${data.reference}
— Whitetail Ridge Golf Dome, Oswego, IL`
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">
  <h1 style="color:#0e1740">You're all set! 🎉</h1>
  <p>Hi ${data.customerName}, we've received your <strong>${formatCents(data.balanceDue)}</strong>
  balance for <strong>${data.dateStr}</strong>. Fully paid — just show up and have a great time.</p>
  <p style="color:#666">Reference ${data.reference} · Whitetail Ridge Golf Dome</p>
</div>`
  return { subject, html, text }
}

/** Internal staff notification with a link into the admin. */
export function buildStaffNotification(data: {
  title: string
  lines: string[]
  adminPath: string
  urgent?: boolean
  actionUrl?: string
  actionLabel?: string
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const url = `${appUrl}${data.adminPath}`
  const subject = `${data.urgent ? '🔴 ACTION NEEDED: ' : ''}${data.title}`
  const text = `${data.title}

${data.lines.join('\n')}
${data.actionUrl ? `\n${data.actionLabel ?? 'One-tap action'}: ${data.actionUrl}\n` : ''}
Open in admin: ${url}`
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">
  <h2 style="color:${data.urgent ? '#b91c1c' : '#0e1740'}">${subject}</h2>
  <ul>${data.lines.map((l) => `<li>${l}</li>`).join('')}</ul>
  ${data.actionUrl ? `<p><a href="${data.actionUrl}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">${data.actionLabel ?? 'One-tap action'} ✓</a></p>` : ''}
  <p><a href="${url}" style="background:#0e1740;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Open in admin →</a></p>
</div>`
  return { subject, html, text }
}

/** Deposit captured, but bays need a quick staff confirmation (shared inventory). */
export function buildDepositReceivedEmail(data: ConfirmationData) {
  const subject = `Deposit received — confirming your date (${data.reference})`
  const text = `Hi ${data.customerName},

We've received your ${formatCents(data.depositAmount)} deposit for ${data.dateStr} — thank you!

We're just double-checking bay availability and will send your final confirmation
shortly (usually within a couple of hours during business hours).

Reference: ${data.reference}
— Whitetail Ridge Golf Dome, Oswego, IL`
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">
  <h1 style="color:#0e1740">Deposit received — almost there!</h1>
  <p>Hi ${data.customerName}, we've received your <strong>${formatCents(data.depositAmount)}</strong>
  deposit for <strong>${data.dateStr}</strong>. We're confirming bay availability and will send
  your final confirmation shortly.</p>
  <p style="color:#666">Reference: <strong>${data.reference}</strong><br/>— Whitetail Ridge Golf Dome</p>
</div>`
  return { subject, html, text }
}

/** Nudge a customer who started but didn't finish a booking (3-touch sequence). */
export function buildRecoveryEmail(data: {
  name?: string | null
  resumeUrl: string
  stage?: 1 | 2 | 3
  promo?: { code: string; percentOff: number; amountOff: number } | null
}) {
  const stage = data.stage ?? 1
  const hi = data.name ? `Hi ${data.name},` : 'Hi there,'
  const promoLine = data.promo
    ? `Use code ${data.promo.code} for ${
        data.promo.percentOff > 0 ? `${data.promo.percentOff}% off` : `${formatCents(data.promo.amountOff)} off`
      } — just enter it at checkout.`
    : ''

  const subjects: Record<number, string> = {
    1: 'Still thinking it over? Your Dome party is waiting 🎉',
    2: 'Your date is still open (for now) ⛳',
    3: data.promo ? `A little something to seal the deal 🎁` : 'Last call for your party 🎈',
  }
  const leads: Record<number, string> = {
    1: 'You were <em>this close</em> to booking your event at Whitetail Ridge Golf Dome — and your details are saved.',
    2: 'Your event details are still saved — but weekends fill up fast, and we can only hold the good slots for so long.',
    3: data.promo
      ? `We saved your details one last time — and here's a nudge: <strong>${promoLine}</strong>`
      : 'This is our last reminder — your saved details expire soon.',
  }

  const subject = subjects[stage]
  const text = `${hi}

${leads[stage].replace(/<[^>]+>/g, '')}

Pick up right where you left off:
${data.resumeUrl}
${promoLine && stage === 3 ? `\n${promoLine}\n` : ''}
Lock your date in with just a 10% deposit.
— Whitetail Ridge Golf Dome, Oswego, IL`

  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">
  <h1 style="color:#0e1740">${subject.replace(/ [^ ]*$/, '')}</h1>
  <p>${hi} ${leads[stage]}</p>
  <p style="text-align:center;margin:28px 0">
    <a href="${data.resumeUrl}" style="background:#c8ff2e;color:#0e1740;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:bold">Finish your booking →</a>
  </p>
  <p>Lock your date in with just a 10% deposit.</p>
  <p style="color:#666">— Whitetail Ridge Golf Dome, Oswego, IL</p>
</div>`
  return { subject, html, text }
}

/** Gentle 24h follow-up for inquiry leads that haven't been closed yet. */
export function buildLeadFollowUpEmail(data: { name: string; inquireUrl: string }) {
  const subject = `Still planning your event? We're ready when you are 🏌️`
  const text = `Hi ${data.name},

Just checking in on your event inquiry at Whitetail Ridge Golf Dome — we'd love to
host you. Reply to this email with any questions, or if your plans changed, tell us
what would make it work (date, budget, group size) and we'll build around it.

— The Whitetail Ridge Golf Dome events team, Oswego, IL`
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">
  <h1 style="color:#0e1740">Still planning your event?</h1>
  <p>Hi ${data.name}, just checking in on your inquiry — we'd love to host you.</p>
  <p>Reply with any questions, or tell us what would make it work (date, budget, group
  size) and we'll build around it.</p>
  <p style="color:#666">— The Whitetail Ridge Golf Dome events team · Oswego, IL</p>
</div>`
  return { subject, html, text }
}

/** Deliver a gift card code to its recipient (and a receipt to the purchaser). */
export function buildGiftCardEmails(data: {
  code: string
  amount: number
  recipientName?: string | null
  purchaserName?: string | null
  message?: string | null
  redeemUrl: string
}) {
  const recipient = {
    subject: `🎁 You've got a Whitetail Ridge Golf Dome gift card!`,
    text: `${data.recipientName ? `Hi ${data.recipientName},` : 'Hi there,'}

${data.purchaserName ? `${data.purchaserName} sent you` : 'You received'} a ${formatCents(data.amount)} gift card to Whitetail Ridge Golf Dome!
${data.message ? `\n"${data.message}"\n` : ''}
Your code: ${data.code}

Redeem it toward any event booking here: ${data.redeemUrl}

See you at the Dome! 🏌️`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;text-align:center">
      <h1 style="color:#0e1740">🎁 You've got a gift!</h1>
      <p>${data.purchaserName ? `<strong>${data.purchaserName}</strong> sent you` : 'You received'} a
      <strong>${formatCents(data.amount)}</strong> gift card to Whitetail Ridge Golf Dome.</p>
      ${data.message ? `<p style="font-style:italic">"${data.message}"</p>` : ''}
      <div style="margin:24px 0;padding:16px;border:2px dashed #0e1740;border-radius:12px">
        <div style="color:#666;font-size:12px">YOUR CODE</div>
        <div style="font-size:24px;font-weight:bold;letter-spacing:2px">${data.code}</div>
      </div>
      <a href="${data.redeemUrl}" style="background:#c8ff2e;color:#0e1740;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:bold">Book your event →</a>
    </div>`,
  }
  const purchaser = {
    subject: `Your Whitetail Ridge Golf Dome gift card receipt`,
    text: `Thanks for your purchase! A ${formatCents(data.amount)} gift card (code ${data.code}) has been sent${data.recipientName ? ` to ${data.recipientName}` : ''}. — Whitetail Ridge Golf Dome`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">
      <h2 style="color:#0e1740">Thanks for your purchase!</h2>
      <p>A <strong>${formatCents(data.amount)}</strong> gift card (code <strong>${data.code}</strong>) has been sent${data.recipientName ? ` to ${data.recipientName}` : ''}.</p>
      <p style="color:#666">— Whitetail Ridge Golf Dome, Oswego, IL</p>
    </div>`,
  }
  return { recipient, purchaser }
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
  <h1 style="color:#0e1740">Your event quote is ready 🎉</h1>
  <p>Hi ${data.name}, here's your custom quote for Whitetail Ridge Golf Dome.</p>
  ${data.message ? `<p>${data.message}</p>` : ''}
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:6px 0;color:#666">Reference</td><td style="text-align:right"><strong>${data.reference}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#666">Total</td><td style="text-align:right">${formatCents(data.total)}</td></tr>
    <tr><td style="padding:6px 0;color:#0e1740">Deposit to reserve</td><td style="text-align:right;color:#0e1740"><strong>${formatCents(data.depositAmount)}</strong></td></tr>
  </table>
  <p style="text-align:center;margin:28px 0">
    <a href="${data.payUrl}" style="background:#c8ff2e;color:#0e1740;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:bold">Reserve your date →</a>
  </p>
  <p style="color:#666">— Whitetail Ridge Golf Dome, Oswego, IL</p>
</div>`
  return { subject, html, text }
}


/** T-3 balance nudge: settle up before the event, skip the line. */
export function buildBalanceDueEmail(data: {
  customerName: string
  reference: string
  dateStr: string
  balanceDue: number
  balanceUrl: string
}) {
  const subject = `Skip the line — settle your balance before the big day (${data.reference})`
  const text = `Hi ${data.customerName},

Your event on ${data.dateStr} is almost here! Your remaining balance is ${formatCents(data.balanceDue)}.

Pay it now and walk straight in on party day — no checkout, no waiting:
${data.balanceUrl}

(You can also settle up at the venue.)

— Whitetail Ridge Golf Dome, Oswego, IL`
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">
  <h1 style="color:#0e1740">Almost party time! 🎉</h1>
  <p>Hi ${data.customerName}, your event on <strong>${data.dateStr}</strong> is almost here.
  Your remaining balance is <strong>${formatCents(data.balanceDue)}</strong>.</p>
  <p>Pay now and walk straight in on party day — no checkout, no waiting:</p>
  <p><a href="${data.balanceUrl}" style="background:#c8ff2e;color:#08102c;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">Pay my balance →</a></p>
  <p style="color:#666;font-size:13px">Prefer to settle at the venue? That works too. Ref: ${data.reference}</p>
</div>`
  return { subject, html, text }
}

/** Post-event thank-you + review request + rebook nudge. */
export function buildThankYouEmail(data: {
  customerName: string
  reference: string
  reviewUrl?: string | null
  bookUrl: string
}) {
  const subject = 'Thanks for partying at the Dome! 🏌️'
  const review = data.reviewUrl
    ? `

Had a great time? A quick review means the world to a local business:
${data.reviewUrl}`
    : ''
  const text = `Hi ${data.customerName},

Thank you for celebrating at Whitetail Ridge Golf Dome — we hope your crew had a blast!${review}

Planning the next one? Birthdays come around every year — book your next event anytime:
${data.bookUrl}

— The Whitetail Ridge team`
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">
  <h1 style="color:#0e1740">Thanks for partying with us! 🎉</h1>
  <p>Hi ${data.customerName}, thank you for celebrating at Whitetail Ridge Golf Dome — we hope your crew had a blast.</p>
  ${data.reviewUrl ? `<p>Had a great time? A quick review means the world to a local business:</p>
  <p><a href="${data.reviewUrl}" style="background:#0e1740;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">Leave a review ⭐</a></p>` : ''}
  <p>Planning the next one? Birthdays come around every year:</p>
  <p><a href="${data.bookUrl}" style="background:#c8ff2e;color:#08102c;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">Book your next event →</a></p>
  <p style="color:#666;font-size:13px">Ref: ${data.reference}</p>
</div>`
  return { subject, html, text }
}
