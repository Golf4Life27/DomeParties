import { prisma } from '@/lib/db'
import type { BookingStatus, Prisma } from '@/generated/prisma'

export const BOOKING_FILTERS = ['ALL', 'NEEDS_REVIEW', 'CONFIRMED', 'COMPLETED', 'PENDING', 'DRAFT', 'CANCELLED'] as const
export type BookingFilter = (typeof BOOKING_FILTERS)[number]

export function parseFilter(status?: string | null): BookingFilter {
  const s = (status ?? 'ALL').toUpperCase()
  return (BOOKING_FILTERS as readonly string[]).includes(s) ? (s as BookingFilter) : 'ALL'
}

/** One where-clause for the Bookings list and its export, so they always agree. */
export async function bookingWhere(filter: BookingFilter, q?: string | null): Promise<Prisma.BookingWhereInput> {
  const and: Prisma.BookingWhereInput[] = []
  if (filter === 'NEEDS_REVIEW') and.push({ status: 'PENDING', depositPaid: true, needsReview: true })
  else if (filter !== 'ALL') and.push({ status: filter as BookingStatus })

  const term = q?.trim()
  if (term) {
    const digits = term.replace(/\D/g, '')
    // Phones are stored however the guest typed them, "(555) 123-4567" or
    // "5551234567", so compare digits only.
    const phoneIds =
      digits.length >= 4
        ? (
            await prisma.$queryRaw<{ id: string }[]>`
              SELECT id FROM "Booking"
              WHERE regexp_replace(coalesce("customerPhone", ''), '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'}
              LIMIT 1000`
          ).map((r) => r.id)
        : []
    and.push({
      OR: [
        { reference: { contains: term, mode: 'insensitive' } },
        { customerName: { contains: term, mode: 'insensitive' } },
        { customerEmail: { contains: term, mode: 'insensitive' } },
        { customerPhone: { contains: term, mode: 'insensitive' } },
        ...(phoneIds.length ? [{ id: { in: phoneIds } }] : []),
      ],
    })
  }
  return and.length ? { AND: and } : {}
}
