import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getVenue } from '@/venues'
import { venueProductOn } from '@/lib/venue-agent/gate'
import VenueChat from '../../../VenueChat'

// A sample venue's chat, or a real venue's preview set up from its public
// website, to show an owner what their guests would get.
export const metadata = { robots: { index: false, follow: false } }

export default async function VenueDemo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const venue = venueProductOn() ? getVenue(slug) : null
  if (!venue) notFound()
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '32px 20px', font: '16px/1.5 system-ui,sans-serif' }}>
      <p>
        <Link href="/for-venues">← Back</Link>
      </p>
      <h1 style={{ fontSize: 26 }}>{venue.name}</h1>
      {venue.prospect ? (
        <p>
          A preview of the chat we set up for {venue.name} from its public website, so you can try it before anything goes on your site. Ask it what
          a guest would ask at 11pm. Nothing is sent to anyone, and you can fix anything it got wrong in one short page.
        </p>
      ) : (
        <p>A made-up venue to show how the chat works. Ask it what a guest would ask: a date, a headcount, food, the deposit.</p>
      )}
      <VenueChat
        venueName={venue.name}
        welcome={venue.locale.startsWith('ja') ? `こんにちは！${venue.name}での団体・イベントのご相談ですか？日にちと人数を教えてください。` : `Hi! Planning a party or group event at ${venue.name}? Tell me the date and how many people.`}
        endpoint={`/api/venue-agent/chat/${venue.slug}`}
      />
    </main>
  )
}
