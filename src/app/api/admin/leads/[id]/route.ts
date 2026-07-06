import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const schema = z.object({
  status: z.enum(['NEW', 'CONTACTED', 'PROPOSAL_SENT', 'WON', 'LOST']),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  const lead = await prisma.lead.update({ where: { id }, data: { status: parsed.data.status } })
  return NextResponse.json({ lead })
}
