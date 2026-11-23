// Replay real guest chats through the party agent and measure what each costs.
//
//   pnpm tsx scripts/agent-replay.ts <chats.json> [--model claude-opus-5-5] [--effort medium] [--out results.json]
//
// Needs ANTHROPIC_API_KEY and DATABASE_URL. Runs in dry mode: hours, packages,
// times and prices are read for real, but no draft, lead or staff email is
// created. The chats file stays outside this repo because it is real guests'
// words; see the shape below.
//
// { "chats": [ { "id": "c01", "guest": ["first message", "next message"], "good": "what a right answer does" } ] }

import 'dotenv/config'
import fs from 'node:fs'
import { runAgent, agentModel, type ChatTurn } from '@/lib/agent/run'

type Chat = { id: string; guest: string[]; good?: string }

// Published list prices, dollars per million tokens. Cache writes bill at 1.25x
// input and cache reads at 0.1x. Update when prices change.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const file = process.argv[2]
  if (!file || file.startsWith('--')) throw new Error('Usage: agent-replay.ts <chats.json> [--model m] [--effort e] [--out f]')
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
  const model = arg('model') ?? agentModel()
  const effortArg = arg('effort')
  const effort = effortArg === 'low' || effortArg === 'high' ? effortArg : 'medium'
  const price = PRICES[model]
  const { chats } = JSON.parse(fs.readFileSync(file, 'utf8')) as { chats: Chat[] }

  const results = []
  for (const chat of chats) {
    const history: ChatTurn[] = []
    const totals = { calls: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 }
    const tools: string[] = []
    for (const line of chat.guest) {
      history.push({ role: 'guest', text: line })
      const r = await runAgent(history, { mode: 'dry', model, effort })
      history.push({ role: 'agent', text: r.reply })
      tools.push(...r.toolsUsed)
      for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += r.usage[k]
    }
    const cost = price
      ? (totals.inputTokens * price.input +
          totals.cacheWriteTokens * price.input * 1.25 +
          totals.cacheReadTokens * price.input * 0.1 +
          totals.outputTokens * price.output) /
        1_000_000
      : null
    results.push({ id: chat.id, good: chat.good ?? null, transcript: history, tools, usage: totals, costUsd: cost })
    console.log(`\n=== ${chat.id} (${totals.calls} calls, ${cost === null ? 'no price for model' : '$' + cost.toFixed(4)})`)
    for (const t of history) console.log(`${t.role === 'guest' ? 'GUEST' : 'AGENT'}: ${t.text}`)
    if (chat.good) console.log(`  should: ${chat.good}`)
  }

  const costs = results.map((r) => r.costUsd).filter((c): c is number => c !== null)
  const summary = {
    model,
    effort,
    chats: results.length,
    guestMessages: chats.reduce((n, c) => n + c.guest.length, 0),
    avgCostPerChatUsd: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    maxCostPerChatUsd: costs.length ? Math.max(...costs) : null,
    totalTokens: results.reduce(
      (n, r) => n + r.usage.inputTokens + r.usage.outputTokens + r.usage.cacheReadTokens + r.usage.cacheWriteTokens,
      0,
    ),
    pricesNote: 'Cost = measured tokens x published list prices in this script.',
  }
  console.log('\n', JSON.stringify(summary, null, 2))
  const out = arg('out')
  if (out) fs.writeFileSync(out, JSON.stringify({ summary, results }, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
