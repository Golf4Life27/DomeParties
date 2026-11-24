import { NextResponse } from 'next/server'
import { getEmailHealth } from '@/lib/email-outbox'

// Public, counts only (no addresses or content), so an outside monitor can
// watch it and raise the alarm when the site's emails stop going out.
export const dynamic = 'force-dynamic'

export async function GET() {
  const h = await getEmailHealth()
  return NextResponse.json(
    {
      ok: !h.failing,
      heldEmails: h.held,
      gaveUp: h.gaveUp,
      oldestHeldMinutes: h.oldestHeldAt ? Math.round((Date.now() - h.oldestHeldAt.getTime()) / 60_000) : null,
      lastOkAt: h.lastOkAt,
      lastFailAt: h.lastFailAt,
    },
    { status: h.failing ? 503 : 200, headers: { 'cache-control': 'no-store' } },
  )
}
