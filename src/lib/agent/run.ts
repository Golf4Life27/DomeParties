import Anthropic from '@anthropic-ai/sdk'
import { AGENT_SYSTEM, agentDateNote } from '@/lib/agent/prompt'
import { AGENT_TOOLS, runTool, type ToolMode } from '@/lib/agent/tools'

// One guest message in, one reply out. The chat is stateless on the server: the
// widget sends the visible conversation each time and the agent re-reads what
// it needs through its tools, so there is nothing to store and nothing to leak
// between guests.

export type ChatTurn = { role: 'guest' | 'agent'; text: string }

export type AgentUsage = {
  calls: number
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
}

export type AgentResult = {
  reply: string
  toolsUsed: string[]
  usage: AgentUsage
  /** True when the loop hit its step limit and the reply is the fallback line. */
  cutOff: boolean
}

/** Tool rounds allowed for one guest message. A normal turn needs two or three. */
const MAX_STEPS = 6

const FALLBACK = `Sorry, I couldn't pull that up just now. Give the dome a call and someone will sort it out.`

let client: Anthropic | null = null
function anthropic(): Anthropic {
  client ??= new Anthropic()
  return client
}

export function agentModel(): string {
  return process.env.DOME_AGENT_MODEL || 'claude-opus-5-5'
}

function agentEffort(): 'low' | 'medium' | 'high' {
  const e = process.env.DOME_AGENT_EFFORT
  return e === 'low' || e === 'high' ? e : 'medium'
}

export async function runAgent(
  history: ChatTurn[],
  opts: { mode: ToolMode; today?: string; model?: string; effort?: 'low' | 'medium' | 'high' } = { mode: 'live' },
): Promise<AgentResult> {
  const usage: AgentUsage = { calls: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 }
  const toolsUsed: string[] = []

  const messages: Anthropic.MessageParam[] = history.map((t) => ({
    role: t.role === 'guest' ? 'user' : 'assistant',
    content: t.text,
  }))

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await anthropic().messages.create({
      model: opts.model ?? agentModel(),
      max_tokens: 4000,
      output_config: { effort: opts.effort ?? agentEffort() },
      system: [
        // Tools and these instructions are the same for every guest, so they're
        // cached; the date note sits after the breakpoint.
        { type: 'text', text: AGENT_SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: agentDateNote(opts.today) },
      ],
      tools: AGENT_TOOLS,
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

    if (response.stop_reason !== 'tool_use') {
      // end_turn, max_tokens or refusal: say what we have, or the fallback.
      return { reply: text || FALLBACK, toolsUsed, usage, cutOff: false }
    }

    const calls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    // The whole assistant turn goes back unchanged, thinking blocks included.
    messages.push({ role: 'assistant', content: response.content })
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const call of calls) {
      toolsUsed.push(call.name)
      results.push({ type: 'tool_result', tool_use_id: call.id, content: await runTool(call.name, call.input, opts.mode) })
    }
    messages.push({ role: 'user', content: results })
  }

  return { reply: FALLBACK, toolsUsed, usage, cutOff: true }
}
