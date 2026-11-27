import { createHmac, timingSafeEqual } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { parseProfile, type VenueProfile } from './profile'

// An owner's own demo link, made the moment they sign up, with nothing saved
// anywhere: the setup rides inside the link, packed small and signed, so the
// link works from any device and nobody can edit a setup into it. The key is
// derived from a server-only setting and never leaves the server.

function key(): Buffer {
  const base = process.env.VENUE_LINK_SECRET || process.env.ANTHROPIC_API_KEY || ''
  if (!base) throw new Error('No signing key')
  return createHmac('sha256', 'partydesk-trial-link-v1').update(base).digest()
}

const sign = (body: string) => createHmac('sha256', key()).update(body).digest('base64url').slice(0, 32)

export function trialToken(profile: VenueProfile): string {
  const body = deflateRawSync(Buffer.from(JSON.stringify(profile)), { level: 9 }).toString('base64url')
  return `${body}.${sign(body)}`
}

/** The setup inside a link, or null if the link was cut short or changed. */
export function readTrialToken(token: string | null | undefined): VenueProfile | null {
  if (!token || token.length > 12000) return null
  const dot = token.lastIndexOf('.')
  if (dot < 1) return null
  const body = token.slice(0, dot)
  const mac = Buffer.from(token.slice(dot + 1))
  const want = Buffer.from(sign(body))
  if (mac.length !== want.length || !timingSafeEqual(mac, want)) return null
  try {
    return parseProfile(JSON.parse(inflateRawSync(Buffer.from(body, 'base64url'), { maxOutputLength: 200_000 }).toString('utf8')))
  } catch {
    return null
  }
}
