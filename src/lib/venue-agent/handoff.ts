import type { VenueProfile } from './profile'
import { formatDate } from './clock'
import type { Handoff } from './tools'

// Gets a guest to a person at the venue. Two ways, both set per venue:
//  - webhookUrl: a JSON POST, for venues whose booking or CRM tool takes one
//  - email: sent from the product's own sending address (VENUE_AGENT_RESEND_KEY
//    and VENUE_AGENT_EMAIL_FROM), never from Whitetail's, so another venue's
//    leads never come from the dome's name.
// Returns true when at least one way got through.
export async function deliverHandoff(p: VenueProfile, h: Handoff): Promise<boolean> {
  const results = await Promise.all([
    p.handoff.webhookUrl ? postWebhook(p.handoff.webhookUrl, p, h) : Promise.resolve(false),
    p.handoff.email ? sendLeadEmail(p.handoff.email, p, h) : Promise.resolve(false),
  ])
  return results.some(Boolean)
}

async function postWebhook(url: string, p: VenueProfile, h: Handoff) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ venue: p.slug, source: 'chat', ...h }),
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch (e) {
    console.error(`[venue-agent] ${p.slug} webhook failed`, e)
    return false
  }
}

export function leadEmailText(p: VenueProfile, h: Handoff): { subject: string; text: string } {
  const who = h.guest_name || 'A guest'
  const lines = [
    `${who} asked about ${h.reason.replace(/_/g, ' ')} in your website chat.`,
    '',
    h.summary,
    '',
    ...(h.preferred_date ? [`Date: ${formatDate(p, h.preferred_date)}`] : []),
    ...(h.headcount ? [`Guests: ${h.headcount}`] : []),
    ...(h.guest_email ? [`Email: ${h.guest_email}`] : []),
    ...(h.guest_phone ? [`Phone: ${h.guest_phone}`] : []),
  ]
  return { subject: `Chat lead: ${who}${h.headcount ? `, ${h.headcount} guests` : ''}`, text: lines.join('\n') }
}

async function sendLeadEmail(to: string, p: VenueProfile, h: Handoff) {
  const key = process.env.VENUE_AGENT_RESEND_KEY
  const from = process.env.VENUE_AGENT_EMAIL_FROM
  if (!key || !from) {
    console.warn(`[venue-agent] ${p.slug} lead email skipped: no sending address set up`)
    return false
  }
  const { subject, text } = leadEmailText(p, h)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, ...(h.guest_email ? { reply_to: h.guest_email } : {}) }),
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch (e) {
    console.error(`[venue-agent] ${p.slug} lead email failed`, e)
    return false
  }
}
