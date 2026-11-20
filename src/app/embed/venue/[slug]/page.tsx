import { notFound } from 'next/navigation'
import { getVenue } from '@/venues'
import { venueProductOn } from '@/lib/venue-agent/gate'
import VenueChat from '../../../VenueChat'

// The floating chat bubble for one venue, loaded in an iframe by /venue-chat.js
// on that venue's own website.
export default async function EmbeddedVenueChat({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const venue = venueProductOn() ? getVenue(slug) : null
  if (!venue) notFound()
  return (
    <>
      <style precedence="default" href="venue-embed" dangerouslySetInnerHTML={{ __html: 'html,body{background:transparent!important}' }} />
      <VenueChat
        floating
        venueName={venue.name}
        welcome={`Hi! Planning a party or group event at ${venue.name}? Tell me the date and how many people, and I'll get you prices.`}
        endpoint={`/api/venue-agent/chat/${venue.slug}`}
      />
    </>
  )
}
