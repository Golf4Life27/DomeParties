import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runAgent, type AgentUsage, type ChatTurn } from '@/lib/agent/run'

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
