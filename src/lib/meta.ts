import { createHash } from 'node:crypto'

// ---------------------------------------------------------------------------
// Meta Conversions API — the server-side twin of the browser pixel.
//
// Ad blockers eat a large share of pixel events, and the events Meta optimizes
// spend against should come from the source of truth anyway: the lead row that
// was actually created, the deposit the webhook actually confirmed. Every event
// carries an event_id equal to the record's id and the browser pixel sends the
// same id, so Meta deduplicates the pair — one conversion, however many of the
// two transports got through.
//
// No-ops unless BOTH env vars are set:
//   NEXT_PUBLIC_META_PIXEL_ID  — the pixel (shared with the browser snippet)
//   META_CAPI_ACCESS_TOKEN     — Events Manager → Settings → Conversions API
//
// Never throws: marketing measurement must never break a lead or a payment.
// ---------------------------------------------------------------------------

const API_VERSION = 'v21.0'

/** SHA-256 hex, as Meta requires for user PII fields. */
function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

function hashEmail(email: string | null | undefined): string | undefined {
  const e = email?.trim().toLowerCase()
  return e ? sha256(e) : undefined
}

/** Meta wants digits with country code; assume US when 10 bare digits. */
function hashPhone(phone: string | null | undefined): string | undefined {
  const digits = phone?.replace(/\D/g, '')
  if (!digits || digits.length < 10) return undefined
  return sha256(digits.length === 10 ? `1${digits}` : digits)
}

export type MetaEvent = {
  eventName: 'Lead' | 'Purchase'
  /** Record id (lead.id / booking.id). MUST match the browser pixel's eventID. */
  eventId: string
  email?: string | null
  phone?: string | null
  /** Dollars. Required by Meta for Purchase. */
  value?: number
  fbclid?: string | null
  /** _fbp cookie — Meta's browser id, its strongest browser↔server match signal. */
  fbp?: string | null
  /** _fbc cookie — Meta's own click-id format; beats one rebuilt from fbclid. */
  fbc?: string | null
  sourceUrl?: string
  clientIp?: string | null
  userAgent?: string | null
}

/** True when both env vars needed for server-side events are present. */
export function metaCapiConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_META_PIXEL_ID && !!process.env.META_CAPI_ACCESS_TOKEN
}

export async function sendMetaEvent(ev: MetaEvent): Promise<void> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID
  const token = process.env.META_CAPI_ACCESS_TOKEN
  if (!pixelId || !token) {
    // Say so. This used to return in silence, which made a missing token look
    // exactly like a working integration: no errors in the logs, no events in
    // Events Manager, and nothing anywhere to tell the two apart. A campaign
    // optimising toward an event that never arrives spends real money, so the
    // one thing this must never be is quiet.
    console.error(
      `[meta-capi] SKIPPED ${ev.eventName} ${ev.eventId} — ${
        !pixelId ? 'NEXT_PUBLIC_META_PIXEL_ID' : 'META_CAPI_ACCESS_TOKEN'
      } is not set in this environment. Server-side conversions are NOT reaching Meta.`,
    )
    return
  }

  const userData: Record<string, unknown> = {}
  const em = hashEmail(ev.email)
  const ph = hashPhone(ev.phone)
  if (em) userData.em = [em]
  if (ph) userData.ph = [ph]
  // Browser id. Meta reports low fbp coverage on Conversions API events as a
  // high-priority data-quality problem, because this is how it recognises that a
  // browser event and a server event came from the same person.
  if (ev.fbp) userData.fbp = ev.fbp
  // Click id. Prefer Meta's own _fbc cookie: it carries the real click
  // timestamp, whereas rebuilding one from a stored fbclid has to substitute
  // "now", which can be days after the click actually happened.
  if (ev.fbc) userData.fbc = ev.fbc
  else if (ev.fbclid) userData.fbc = `fb.1.${Date.now()}.${ev.fbclid}`
  if (ev.clientIp) userData.client_ip_address = ev.clientIp
  if (ev.userAgent) userData.client_user_agent = ev.userAgent
  // Meta rejects events with no user data at all; without any there is nothing
  // to match against anyway.
  if (Object.keys(userData).length === 0) return

  const body = {
    data: [
      {
        event_name: ev.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: ev.eventId,
        action_source: 'website',
        event_source_url: ev.sourceUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? undefined,
        user_data: userData,
        ...(ev.value != null
          ? { custom_data: { value: Math.round(ev.value * 100) / 100, currency: 'USD' } }
          : {}),
      },
    ],
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    )
    if (!res.ok) {
      const detail = await res.text().catch(() => '(no body)')
      console.error(`[meta-capi] ${ev.eventName} ${ev.eventId} rejected (${res.status}): ${detail.slice(0, 300)}`)
      return
    }
    // Log successes too. Without this there is no way to tell "sent and accepted"
    // from "never ran", which is the ambiguity that cost us a week.
    console.log(`[meta-capi] ${ev.eventName} ${ev.eventId} accepted by Meta`)
  } catch (e) {
    console.error(`[meta-capi] ${ev.eventName} ${ev.eventId} send failed`, e)
  }
}
