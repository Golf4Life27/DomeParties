import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runAgent, type AgentUsage, type ChatTurn } from '@/lib/agent/run'
import { prisma } from '@/lib/db'
import { computeQuote } from '@/lib/pricing'

// GET /api/agent/replay?chat=c05 — preview-only test harness. Plays one saved
// guest chat through the agent turn by turn, in dry mode, and returns every
// reply with its measured token counts. The saved chats live in the
// AGENT_REPLAY_CHATS env var (preview only), never in the repo, so guest words
// stay out of source control. Anywhere else this answers 404.

export const maxDuration = 300

const chatsSchema = z.array(z.object({ id: z.string(), guest: z.array(z.string().min(1)).min(1) }))

export async function GET(req: NextRequest) {
  if (
    process.env.VERCEL_ENV !== 'preview' ||
    process.env.DOME_AGENT !== 'on' ||
    !process.env.ANTHROPIC_API_KEY ||
    !process.env.AGENT_REPLAY_CHATS
  ) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const chats = chatsSchema.safeParse(JSON.parse(process.env.AGENT_REPLAY_CHATS))
  if (!chats.success) return NextResponse.json({ error: 'Bad chat list' }, { status: 500 })

  // ?report=service-charge — read-only count of bookings that carried a
  // service charge with no food or drinks on the order. No guest details.
  if (req.nextUrl.searchParams.get('report') === 'service-charge') {
    const setting = await prisma.setting.findUnique({ where: { id: 1 }, select: { serviceChargePct: true, serviceChargeOnGolf: true } })
    const byStatus = await prisma.booking.groupBy({ by: ['status'], _count: true })
    const rows = await prisma.booking.findMany({
      where: { serviceCharge: { gt: 0 }, fnbTotal: 0, status: { not: 'DRAFT' } },
      select: {
        reference: true, status: true, date: true, createdAt: true, partySize: true, packageTotal: true, addOnsTotal: true,
        serviceCharge: true, total: true, depositAmount: true, depositPaid: true, balanceDue: true, balancePaid: true,
        balancePaidAmount: true, package: { select: { name: true } },
        startMinutes: true, endMinutes: true, baysNeeded: true, needsReview: true, paidAt: true, rescheduledAt: true,
        reminder7SentAt: true, holdExpiresAt: true, customerName: true, customerEmail: true, customerPhone: true, notes: true,
        resources: { select: { resource: { select: { name: true } } } },
        addOns: { select: { addOn: { select: { name: true, category: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    })
    const noFood = rows.filter((b) => !b.addOns.some((x) => ['Food', 'Beverages'].includes(x.addOn.category)))
    // Spot checks: every active package for 25 golfers on Sat Nov 7 at 5pm,
    // bays only and with the first active food package.
    const pkgs = await prisma.package.findMany({ where: { active: true }, select: { id: true, name: true } })
    const food = await prisma.fnbPackage.findFirst({ where: { active: true, serviceCharge: true }, orderBy: { sortOrder: 'asc' } })
    const checks = []
    for (const p of pkgs) {
      for (const fnbPackageId of [null, food?.id ?? null]) {
        try {
          const q = await computeQuote({ packageId: p.id, partySize: 25, fnbPackageId, addOns: [], dateStr: '2026-11-07', startMinutes: 17 * 60 })
          checks.push({ pkg: p.name, food: fnbPackageId ? food?.name : null, serviceCharge: q.serviceCharge, bookingFee: q.bookingFee, total: q.total, deposit: q.depositAmount })
        } catch (e) {
          checks.push({ pkg: p.name, food: fnbPackageId ? food?.name : null, error: String(e) })
        }
        if (!food) break
      }
    }
    // Any inquiry the same guest sent through the contact form, by email.
    const leads = await prisma.lead.findMany({
      where: { customerEmail: { in: noFood.map((b) => b.customerEmail).filter((e): e is string => !!e), mode: 'insensitive' } },
      select: { customerEmail: true, status: true, message: true, createdAt: true, preferredDate: true, followUpSentAt: true },
    })
    return NextResponse.json({
      setting, byStatus, checks, leads,
      affected: noFood.map((b) => ({ ...b, addOns: b.addOns.map((x) => x.addOn.name), resources: b.resources.map((r) => r.resource.name) })),
    })
  }

  const id = req.nextUrl.searchParams.get('chat')
  if (!id) return NextResponse.json({ chats: chats.data.map((c) => c.id) })
  const chat = chats.data.find((c) => c.id === id)
  if (!chat) return NextResponse.json({ error: 'Unknown chat' }, { status: 404 })

  const hist: ChatTurn[] = []
  const tools: string[] = []
  const usage: AgentUsage = { calls: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 }
  for (const text of chat.guest) {
    hist.push({ role: 'guest', text })
    const r = await runAgent(hist, { mode: 'dry' })
    hist.push({ role: 'agent', text: r.reply })
    // Long chats can outlast the caller; each turn is logged so the run can be
    // read back from the deployment's logs either way.
    console.log('[replay] turn', JSON.stringify({ id, turn: hist.length / 2, reply: r.reply, tools: r.toolsUsed, usage: r.usage }))
    tools.push(...r.toolsUsed)
    for (const k of Object.keys(usage) as (keyof AgentUsage)[]) usage[k] += r.usage[k]
  }
  return NextResponse.json({ id, hist, tools, usage })
}
