import { prisma } from '@/lib/db'
import { bookingWhere, parseFilter } from '@/lib/booking-search'
import { minutesToLabel } from '@/lib/time'

// Full CSV export of bookings. Admin-only: /api/admin/export is not on the
// coordinator allowlist in @/lib/access, so proxy.ts refuses other roles.
// Honors the same ?status= and ?q= as the Bookings list.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const COLUMNS = [
  'reference', 'status', 'eventType', 'eventDate', 'startTime', 'partySize', 'fnbGuests',
  'package', 'foodAndDrink', 'customerName', 'customerEmail', 'customerPhone',
  'packageTotal', 'fnbTotal', 'addOnsTotal', 'serviceCharge', 'tax', 'promoDiscount',
  'giftCardApplied', 'total', 'depositAmount', 'depositPaid', 'paidAt', 'balanceDue',
  'balancePaid', 'needsReview', 'utmSource', 'utmCampaign', 'createdAt', 'updatedAt',
] as const

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = v instanceof Date ? v.toISOString() : String(v)
  // Stop a spreadsheet from running a guest-typed value as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const dollars = (cents: number) => (cents / 100).toFixed(2)

export async function GET(req: Request) {
  const url = new URL(req.url)
  const where = bookingWhere(parseFilter(url.searchParams.get('status')), url.searchParams.get('q'))

  const lines: string[] = [COLUMNS.join(',')]
  const PAGE = 500
  let cursor: string | undefined
  for (;;) {
    const rows = await prisma.booking.findMany({
      where,
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { package: { select: { name: true } }, fnbPackage: { select: { name: true } } },
    })
    for (const b of rows) {
      const draft = b.status === 'DRAFT'
      lines.push(
        [
          b.reference, b.status, b.eventType,
          draft ? '' : b.date.toISOString().slice(0, 10),
          draft ? '' : minutesToLabel(b.startMinutes),
          b.partySize, b.fnbGuests, b.package?.name, b.fnbPackage?.name,
          b.customerName, b.customerEmail, b.customerPhone,
          dollars(b.packageTotal), dollars(b.fnbTotal), dollars(b.addOnsTotal), dollars(b.serviceCharge),
          dollars(b.taxAmount), dollars(b.promoDiscount), dollars(b.giftCardApplied), dollars(b.total),
          dollars(b.depositAmount), b.depositPaid, b.paidAt, dollars(b.balanceDue), b.balancePaid,
          b.needsReview, b.utmSource, b.utmCampaign, b.createdAt, b.updatedAt,
        ]
          .map(cell)
          .join(','),
      )
    }
    if (rows.length < PAGE) break
    cursor = rows[rows.length - 1].id
  }

  const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="dome-bookings-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
