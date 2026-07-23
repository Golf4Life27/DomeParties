import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseReservations, ingestExternalReservations, scanDate } from '@/lib/trackman'

const schema = z.object({
  dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  text: z.string().max(20000),
})

// POST /api/admin/trackman/import — replace a date's Trackman reservations from
// pasted text, then scan that date for capacity conflicts against our bookings.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  const { rows, skipped } = parseReservations(parsed.data.text)
  await ingestExternalReservations(parsed.data.dateStr, rows)
  const conflicts = await scanDate(parsed.data.dateStr)
  return NextResponse.json({
    ok: true,
    imported: rows.length,
    skipped,
    conflicts,
  })
}
