import { parseProfile, type VenueProfile } from '@/lib/venue-agent/profile'
import sampleLanes from './sample-lanes.json'
import sampleSwingSocial from './sample-swing-social.json'
import sampleTokyoRange from './sample-tokyo-range.json'

// Venues served by the venue agent. Each is one setup file; nothing else
// changes to add one. Checked once at startup, so a bad setup fails the build
// rather than a guest's chat.
const VENUES: Record<string, VenueProfile> = Object.fromEntries(
  [sampleLanes, sampleSwingSocial, sampleTokyoRange].map((raw) => {
    const p = parseProfile(raw)
    return [p.slug, p]
  }),
)

export function getVenue(slug: string): VenueProfile | null {
  return VENUES[slug] ?? null
}

export function listVenues(): VenueProfile[] {
  return Object.values(VENUES)
}
