import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runAgent } from '@/lib/agent/run'

// POST /api/agent — the after-hours party agent. Switched off unless
// DOME_AGENT=on and an Anthropic key is set; off, it answers 404 as if it
// didn't exist, so nothing on the live site changes until it's turned on.

const schema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['guest', 'agent']), text: z.string().trim().min(1).max(1500) }))
    .min(1)
    .max(40)
    .refine((m) => m[m.length - 1].role === 'guest', 'Last message must be from the guest'),
})

// Every message costs a model call, so one visitor can't run up the bill.
// Best effort: per server instance, which is enough to stop a loop or a bored
// visitor, not a determined attacker.
const WINDOW_MS = 10 * 60_000
const PER_WINDOW = 20
const seen = new Map<string, number[]>()

function overLimit(ip: string): boolean {
  const now = Date.now()
  const recent = (seen.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  seen.set(ip, recent)
  if (seen.size > 5000) seen.clear()
  return recent.length > PER_WINDOW
}

export async function POST(req: NextRequest) {
  if (process.env.DOME_AGENT !== 'on' || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (overLimit(ip)) {
    return NextResponse.json({ error: 'Too many messages. Try again in a few minutes.' }, { status: 429 })
  }
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  // Preview deployments share the live database, so there the agent reads for
  // real but never saves a draft, a lead or sends a staff email. That makes a
  // preview the safe place to test it on real chats, and its token counts come
  // back in the response so the cost can be measured.
  const preview = process.env.VERCEL_ENV === 'preview'
  try {
    const result = await runAgent(parsed.data.messages, { mode: preview ? 'dry' : 'live' })
    console.log('[agent] turn', {
      tools: result.toolsUsed,
      calls: result.usage.calls,
      in: result.usage.inputTokens,
      out: result.usage.outputTokens,
      cacheRead: result.usage.cacheReadTokens,
      cacheWrite: result.usage.cacheWriteTokens,
      cutOff: result.cutOff,
    })
    return NextResponse.json(preview ? { reply: result.reply, usage: result.usage, tools: result.toolsUsed } : { reply: result.reply })
  } catch (e) {
    console.error('[agent] failed', e)
    return NextResponse.json({ error: 'The chat is unavailable right now.' }, { status: 502 })
  }
}
