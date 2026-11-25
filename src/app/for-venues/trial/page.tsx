import { notFound } from 'next/navigation'
import Link from 'next/link'
import { venueProductOn, isPreview } from '@/lib/venue-agent/gate'
import { readTrialToken } from '@/lib/venue-agent/trial-link'
import VenueChat from '../../VenueChat'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your party chat', robots: { index: false, follow: false } }

// An owner's own demo link from self-serve signup. The setup is inside the
// signed link, so it works on any device and nothing is stored.
export default async function Trial({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  if (!venueProductOn()) notFound()
  const { t } = await searchParams
  const profile = readTrialToken(t)
  if (!profile) notFound()
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '32px 20px', font: '16px/1.5 system-ui,sans-serif' }}>
      <p>
        <Link href="/for-venues">← PartyDesk</Link>
      </p>
      <h1 style={{ fontSize: 26 }}>{profile.name}</h1>
      <p>Your party chat, built from your website. Ask it what a guest would ask at 11pm. Nothing is sent to anyone while you try it.</p>
      <VenueChat venueName={profile.name} welcome={`Hi! Planning a party at ${profile.name}? Tell me the date and how many people.`} endpoint="/api/venue-agent/demo" extra={{ profile }} />
      {isPreview() && (
        <p style={{ fontSize: 14, marginTop: 16 }}>
          <a href={`/api/venue-agent/selftest?trialcheck=${encodeURIComponent(t ?? '')}`}>Preview only: check this chat’s prices against the live website</a>
        </p>
      )}
    </main>
  )
}
