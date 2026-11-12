import type { PartyRequest, PilotStore } from './pilot'

// The database copy of counted pilot requests. Loaded only when a live chat
// or the monthly list needs it, so tests and previews never open a connection.
export const dbPilotStore: PilotStore = {
  async since(venue, from) {
    const { prisma } = await import('@/lib/db')
    const rows = await prisma.venuePartyRequest.findMany({
      where: { venue, createdAt: { gte: from } },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(
      (r): PartyRequest => ({
        venue: r.venue,
        at: r.createdAt,
        guestName: r.guestName,
        guestEmail: r.guestEmail,
        guestPhone: r.guestPhone,
        partyDate: r.partyDate,
        headcount: r.headcount,
        summary: r.summary,
      }),
    )
  },
  async add(r) {
    const { prisma } = await import('@/lib/db')
    await prisma.venuePartyRequest.create({
      data: {
        venue: r.venue,
        createdAt: r.at,
        guestName: r.guestName,
        guestEmail: r.guestEmail,
        guestPhone: r.guestPhone,
        partyDate: r.partyDate,
        headcount: r.headcount,
        summary: r.summary,
      },
    })
  },
}
