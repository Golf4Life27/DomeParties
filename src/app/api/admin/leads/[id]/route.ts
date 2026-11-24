import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { CLOSED_LEAD_STATUSES, LEAD_STATUSES } from '@/lib/lead-status'

const schema = z
  .object({
    status: z.enum(LEAD_STATUSES),
    // The event's dollar value in cents, required when marking a lead won.
    wonValue: z.number().int().positive().max(100_000_000).optional(),
  })
  .refine((d) => d.status !== 'WON' || d.wonValue !== undefined, {
    message: 'Enter the event’s dollar value to mark it won.',
    path: ['wonValue'],
  })

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  const { status, wonValue } = parsed.data
  const closed = CLOSED_LEAD_STATUSES.includes(status)
  const lead = await prisma.lead.update({
    where: { id },
    data: {
      status,
      wonValue: status === 'WON' ? wonValue : null,
      closedAt: closed ? new Date() : null,
    },
  })
  return NextResponse.json({ lead })
}
