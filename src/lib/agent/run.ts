import Anthropic from '@anthropic-ai/sdk'
import { AGENT_SYSTEM, agentCatalogNote, agentDateNote } from '@/lib/agent/prompt'
import { AGENT_TOOLS, partyCatalogText, runTool, type ToolMode } from '@/lib/agent/tools'

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

/** One tool call, for the preview benchmark and the turn log. */
export type ToolTrace = { name: string; input: unknown; result: string; ms: number }

export type AgentResult = {
  reply: string
  toolsUsed: string[]
  usage: AgentUsage
  /** True when the loop hit its step limit and the reply is the fallback line. */
  cutOff: boolean
  /** Every tool call this turn, in order. */
  trace: ToolTrace[]
  /** Milliseconds spent waiting on the model, summed over calls. */
  modelMs: number
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
  opts: {
    mode: ToolMode
    today?: string
    model?: string
    effort?: 'low' | 'medium' | 'high'
    speed?: 'fast'
    /** The original one-lookup-at-a-time loop, kept only so the preview benchmark can time it. */
    legacy?: boolean
  } = { mode: 'live' },
): Promise<AgentResult> {
  const usage: AgentUsage = { calls: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 }
  const toolsUsed: string[] = []
  const trace: ToolTrace[] = []
  let modelMs = 0

  // Tools render first, then these blocks. The instructions and the catalog
  // change rarely, so both sit before cache breakpoints; the date note is last.
  const system: Anthropic.TextBlockParam[] = [{ type: 'text', text: AGENT_SYSTEM, cache_control: { type: 'ephemeral' } }]
  if (!opts.legacy) {
    system.push({ type: 'text', text: agentCatalogNote(await partyCatalogText()), cache_control: { type: 'ephemeral' } })
  }
  system.push({ type: 'text', text: agentDateNote(opts.today) })

  const messages: Anthropic.MessageParam[] = history.map((t) => ({
    role: t.role === 'guest' ? 'user' : 'assistant',
    content: t.text,
  }))

  for (let step = 0; step < MAX_STEPS; step++) {
    const started = Date.now()
    const response = await anthropic().messages.create({
      model: opts.model ?? agentModel(),
      max_tokens: 4000,
      output_config: { effort: opts.effort ?? agentEffort() },
      // Caches the conversation so far, so each later step of the same turn
      // re-reads the earlier steps from cache instead of paying for them again.
      ...(opts.legacy ? {} : { cache_control: { type: 'ephemeral' as const } }),
      ...(opts.speed ? { speed: opts.speed } : {}),
      system,
      tools: AGENT_TOOLS,
      messages,
    })
    modelMs += Date.now() - started

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
      return { reply: text || FALLBACK, toolsUsed, usage, cutOff: false, trace, modelMs }
    }

    const calls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    // The whole assistant turn goes back unchanged, thinking blocks included.
    messages.push({ role: 'assistant', content: response.content })
    const timed = async (call: Anthropic.ToolUseBlock): Promise<ToolTrace> => {
      const t0 = Date.now()
      const result = await runTool(call.name, call.input, opts.mode)
      return { name: call.name, input: call.input, result, ms: Date.now() - t0 }
    }
    let done: ToolTrace[]
    if (opts.legacy) {
      done = []
      for (const call of calls) done.push(await timed(call))
    } else {
      // Lookups in the same step don't depend on each other; run them together.
      done = await Promise.all(calls.map(timed))
    }
    // All results go back in one message, in the order the calls were made.
    const results: Anthropic.ToolResultBlockParam[] = calls.map((call, i) => ({
      type: 'tool_result',
      tool_use_id: call.id,
      content: done[i].result,
    }))
    for (const d of done) {
      toolsUsed.push(d.name)
      trace.push(d)
    }
    messages.push({ role: 'user', content: results })
  }

  return { reply: FALLBACK, toolsUsed, usage, cutOff: true, trace, modelMs }
}
