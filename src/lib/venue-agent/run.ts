import Anthropic from '@anthropic-ai/sdk'
import type { VenueProfile } from './profile'
import { venueDateNote, venueSystemPrompt } from './prompt'
import { runVenueTool, VENUE_TOOLS, type ToolMode } from './tools'
import { todayIn } from './clock'

// One guest message in, one reply out, for any venue. Stateless like the dome
// agent: the widget sends the visible conversation each time.

export type ChatTurn = { role: 'guest' | 'agent'; text: string }
export type AgentUsage = { calls: number; inputTokens: number; outputTokens: number; cacheWriteTokens: number; cacheReadTokens: number }
export type AgentResult = { reply: string; toolsUsed: string[]; usage: AgentUsage; cutOff: boolean }

const MAX_STEPS = 6

let client: Anthropic | null = null
const anthropic = () => (client ??= new Anthropic())

/** One setting swaps the model for every venue. */
export function venueAgentModel(): string {
  return process.env.VENUE_AGENT_MODEL || process.env.DOME_AGENT_MODEL || 'claude-opus-5-5'
}

function effort(): 'low' | 'medium' | 'high' {
  const e = process.env.VENUE_AGENT_EFFORT
  return e === 'low' || e === 'high' ? e : 'medium'
}

function fallback(p: VenueProfile) {
  return `Sorry, I couldn't pull that up just now.${p.phone ? ` Give us a call at ${p.phone} and someone will sort it out.` : ' Please try again in a moment.'}`
}

export async function runVenueAgent(
  p: VenueProfile,
  history: ChatTurn[],
  opts: { mode: ToolMode; now?: Date; model?: string } = { mode: 'live' },
): Promise<AgentResult> {
  const usage: AgentUsage = { calls: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 }
  const toolsUsed: string[] = []
  const today = todayIn(p.timeZone, opts.now)
  const system = venueSystemPrompt(p)
  const messages: Anthropic.MessageParam[] = history.map((t) => ({ role: t.role === 'guest' ? 'user' : 'assistant', content: t.text }))

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await anthropic().messages.create({
      model: opts.model ?? venueAgentModel(),
      max_tokens: 4000,
      output_config: { effort: effort() },
      system: [
        // Same for every guest of this venue, so it's cached; the date sits after it.
        { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: venueDateNote(p, opts.now) },
      ],
      tools: VENUE_TOOLS,
      messages,
    })
    usage.calls++
    usage.inputTokens += response.usage.input_tokens
    usage.outputTokens += response.usage.output_tokens
    usage.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0
    usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    if (response.stop_reason !== 'tool_use') return { reply: text || fallback(p), toolsUsed, usage, cutOff: false }

    const calls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    messages.push({ role: 'assistant', content: response.content })
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const call of calls) {
      toolsUsed.push(call.name)
      results.push({ type: 'tool_result', tool_use_id: call.id, content: await runVenueTool(p, call.name, call.input, opts.mode, today) })
    }
    messages.push({ role: 'user', content: results })
  }
  return { reply: fallback(p), toolsUsed, usage, cutOff: true }
}
