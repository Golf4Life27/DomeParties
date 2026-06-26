import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { updateDraft } from '@/lib/booking'

const patchSchema = z.object({
  dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startMinutes: z.number().int().min(0).max(1439).optional(),
  partySize: z.number().int().min(1).max(300).optional(),
  packageId: z.string().nullish(),
  fnbPackageId: z.string().nullish(),
  addOns: z
    .array(z.object({ addOnId: z.string(), quantity: z.number().int().min(1).max(50) }))
    .optional(),
  customerName: z.string().max(120).optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().max(40).optional(),
  notes: z.string().max(2000).optional(),
  waiverSigned: z.boolean().optional(),
  waiverSignedName: z.string().max(120).optional(),
  waiverGuardian: z.boolean().optional(),
})

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { package: true, fnbPackage: true, addOns: { include: { addOn: true } } },
  })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ booking })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.issues }, { status: 400 })
  }
  const existing = await prisma.booking.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== 'DRAFT' && existing.status !== 'PENDING') {
    return NextResponse.json({ error: 'Booking can no longer be edited' }, { status: 409 })
  }
  const booking = await updateDraft(id, parsed.data)
  return NextResponse.json({ booking })
}
