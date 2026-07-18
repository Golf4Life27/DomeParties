import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const schema = z.object({
  openHour: z.number().int().min(0).max(23),
  closeHour: z.number().int().min(1).max(24),
  bayCapacity: z.number().int().min(1).max(50),
  bufferMinutes: z.number().int().min(0).max(240),
  leadTimeDaysOnline: z.number().int().min(0).max(365),
  holdMinutes: z.number().int().min(5).max(1440),
  staffNotifyEmail: z
    .string()
    .email()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  reviewUrl: z
    .string()
    .url()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  depositPercent: z.number().int().min(0).max(100),
  serviceChargePct: z.number().int().min(0).max(100),
  serviceChargeOnGolf: z.boolean(),
  taxPct: z.number().min(0).max(30),
  peakSurchargePct: z.number().int().min(0).max(100),
  offPeakDiscountPct: z.number().int().min(0).max(100),
  cardFeePct: z.number().min(0).max(10),
  cancelHoursLarge: z.number().int().min(0).max(720),
  cancelHoursSmall: z.number().int().min(0).max(720),
  cancelLargeThreshold: z.number().int().min(1).max(500),
})

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.partial().safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid', details: parsed.error.issues }, { status: 400 })
  }
  const setting = await prisma.setting.update({ where: { id: 1 }, data: parsed.data })
  return NextResponse.json({ setting })
}
