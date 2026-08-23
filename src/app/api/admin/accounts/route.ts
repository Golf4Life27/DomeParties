import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { computeNextOutreach } from '@/lib/accounts'

// Annual account records. Gated by the admin cookie in src/proxy.ts like every
// other /api/admin route.

const KINDS = ['FUNDRAISER', 'CORPORATE', 'CHAMBER', 'BOOSTER', 'MILESTONE', 'OTHER'] as const

/** '' from an HTML form means "not set", not an empty string in the database. */
const blankToNull = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null))

/** Money arrives as dollars from the form; everything else here is cents. */
const dollarsToCents = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'number' ? v : parseFloat(v.replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) ? Math.round(n * 100) : null
  })

const intOrNull = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => {
      if (v === null || v === undefined || v === '') return null
      const n = typeof v === 'number' ? v : parseInt(v, 10)
      return Number.isFinite(n) && n >= min && n <= max ? n : null
    })

const schema = z.object({
  id: z.string().optional(),
  contactName: z.string().min(1).max(120),
  organization: blankToNull(160),
  contactRole: blankToNull(120),
  email: blankToNull(160),
  phone: blankToNull(40),
  kind: z.enum(KINDS).default('OTHER'),
  typicalMonth: intOrNull(1, 12),
  lastEventOn: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null)),
  lastEventValue: dollarsToCents,
  lastHeadcount: intOrNull(1, 1000),
  timesBooked: intOrNull(1, 100),
  relationshipOwner: blankToNull(120),
  notes: blankToNull(4000),
  active: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  const { id, ...d } = parsed.data
  const data = {
    ...d,
    timesBooked: d.timesBooked ?? 1,
    // Derived from the event month rather than typed in. Recomputed on every
    // save so correcting the month fixes the reminder without a second step.
    nextOutreachOn: computeNextOutreach(d.typicalMonth),
  }

  const account = id
    ? await prisma.account.update({ where: { id }, data })
    : await prisma.account.create({ data })
  return NextResponse.json({ ok: true, account })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // Deactivate rather than delete: the history of who booked what is the whole
  // point of the record, and a lapsed account is still worth reading later.
  await prisma.account.update({ where: { id }, data: { active: false, nextOutreachOn: null } })
  return NextResponse.json({ ok: true })
}
