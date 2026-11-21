import { PILOT } from './pilot'

// Answers a venue owner's reply to a PartyDesk email, from that venue's own
// offer, with no model call: every fact in an answer is written here, so an
// answer can't drift from the offer the email made.
//
// Three kinds get an answer: a yes, a price or terms question, and a stop.
// A stop gets no email at all. The footer of every email promises "reply 'no
// thanks' and I won't write again", so the venue is logged do-not-contact and
// its sequence ends. Anything else goes to a person, never a guess.
// Any reply, of any kind, ends that venue's follow-up sequence (decision 43).

export type ReplyKind = 'yes' | 'price' | 'stop' | 'unsure'

export type OwnerOffer = {
  venueName: string
  demoUrl: string
  /** What the venue's own email offered: first month free, or the 60-day pilot (US only). */
  offer: 'free-month' | 'pilot'
  /** The plan the email led with. */
  lead: 'starter' | 'pro'
  /** The venue's billing currency. */
  currency: 'USD' | 'GBP' | 'EUR' | 'AUD'
}

export type ReplyPlan = {
  kind: ReplyKind
  /** The email to send back, or null when nothing should be sent. */
  email: { subject: string; text: string } | null
  doNotContact: boolean
  stopSequence: true
  needsPerson: boolean
  why: string
}

const MONTHLY = { USD: { starter: 299, pro: 499 }, GBP: { starter: 229, pro: 379 }, EUR: { starter: 269, pro: 449 }, AUD: { starter: 449, pro: 749 } } as const
const LOCALE = { USD: 'en-US', GBP: 'en-GB', EUR: 'en-IE', AUD: 'en-AU' } as const

function money(n: number, cur: OwnerOffer['currency']): string {
  const s = new Intl.NumberFormat(LOCALE[cur], { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n)
  return cur === 'AUD' ? s.replace(/^\$/, 'A$') : s
}

/** The owner's own words: quoted history and signatures from earlier emails are cut. */
export function ownWords(text: string): string {
  const lines: string[] = []
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (/^\s*>/.test(line)) continue
    if (/^\s*On .{4,120}wrote:\s*$/i.test(line) || /^-{2,}\s*Original Message/i.test(line) || /^\s*From: .+@/i.test(line)) break
    lines.push(line)
  }
  return lines.join('\n').trim()
}

const STOP = new RegExp(
  [
    String.raw`\bno,? thanks?\b`,
    String.raw`\bno thank you\b`,
    String.raw`\bnot? interested\b`,
    String.raw`\bun-?subscribe\b`,
    String.raw`\bopt(?:ing)?[- ]?out\b`,
    String.raw`\bremove (?:me|us|this (?:address|email))\b`,
    String.raw`\btake (?:me|us) off\b`,
    String.raw`\boff (?:your|the) (?:list|mailing)\b`,
    String.raw`\bstop (?:e-?mailing|emailing|sending|contacting|writing|messaging|reaching out)\b`,
    String.raw`^\W*stop\W*$`,
    String.raw`^\W*stop[.!]`,
    String.raw`\b(?:do not|don'?t|dont) (?:e-?mail|email|contact|write|send|message)\b`,
    String.raw`\bwe(?:'re| are) (?:all set|good|covered|set)\b`,
    String.raw`\b(?:all set|we'?re fine),? thanks?\b`,
    String.raw`\bleave (?:me|us) alone\b`,
    String.raw`\bspam\b`,
    String.raw`\bpass(?:ing)? on this\b`,
    String.raw`\bnot for us\b`,
  ].join('|'),
  'im',
)
const ALREADY = /\balready (?:use|have|using|got|work with)\b/i
const YES = new RegExp(
  [
    String.raw`\byes\b`, String.raw`\byeah\b`, String.raw`\byep\b`, String.raw`\byup\b`, String.raw`\bsure\b`,
    String.raw`\blet'?s (?:do|try|go|get)\b`, String.raw`\bsign (?:me|us) up\b`, String.raw`\bsounds (?:good|great)\b`,
    String.raw`\b(?:i'?m|we'?re|count (?:me|us)) in\b`, String.raw`\bgo ahead\b`, String.raw`\bsend (?:it|it over|me)\b`,
    String.raw`\bset (?:it|us|me) up\b`, String.raw`\bhow (?:do|can) (?:i|we) (?:get|start|add|install|sign|set|put|turn|switch)\b`,
    String.raw`\b(?:get|put) (?:this|it) (?:on|onto|up on)\b`, String.raw`\bwant (?:it|this|to (?:try|start|do|use|get))\b`,
    String.raw`\b(?:we'?d|i'?d) (?:like|love) (?:to|it|this)\b`, String.raw`\binterested\b`, String.raw`\bready to\b`,
    String.raw`\bon board\b`, String.raw`\bgive it a (?:try|shot|go)\b`, String.raw`\bdo it\b`, String.raw`\bnext steps?\b`,
  ].join('|'),
  'i',
)

/** The terms a reply asks about, so each gets its own answer. */
const TOPICS = {
  contract: /\bcontract|commit|locked? in|lock-?in|minimum term|long term|cancel|quit|stop (?:paying|it) any ?time|get out\b/i,
  card: /\bcredit card|\bcard\b|payment (?:info|details|method)|pay up ?front|charge (?:me|us) now\b/i,
  setupFee: /\bset ?up fee|setup cost|install(?:ation)? (?:fee|cost)|hidden (?:fee|cost)|extra fees?|any fees?|other fees?|catch\b/i,
  after: /\bafter (?:the )?(?:free|first|trial|pilot|60|sixty|month|that)|when (?:the )?(?:free|trial|pilot) (?:month )?(?:ends|is up|runs out)|then what\b/i,
  counts: /\bwhat counts|count as|counted|per request|each request|what(?:'s| is) a (?:party )?request|how (?:do you|are) (?:requests )?count|\$20\b/i,
  plans: /\b(?:499|299|pro\b|starter|difference|vs\.?|versus|which plan|two plans|both plans)\b/i,
  site: /\bwix|squarespace|wordpress|godaddy|weebly|shopify|webflow|our (?:web)?site (?:is|runs|uses|was built|is through)|website (?:is )?(?:through|done by|run by)|website builder|work on (?:our|my) site|who (?:installs|puts it)|install(?:ed)? it for|get it installed|work with (?:him|her|them|our)|don'?t know how to (?:add|install|code)|not (?:techy|technical|tech savvy)|web ?guy|local guy|web person|web designer|developer|do you (?:set it up|install)|or do (?:i|we) have to\b/i,
  speed: /\bhow (?:fast|quick|soon|long)|by (?:this|next) (?:week|weekend)|before (?:the )?(?:holidays|christmas|december)|up and running\b/i,
  pick: /\bwhich (?:one|plan) (?:would|will|do|are) (?:we|i)|do (?:i|we) (?:get to )?(?:pick|choose)|can (?:i|we) (?:pick|choose|switch|change)|switch plans|change plans|upgrade|downgrade\b/i,
  worth: /\bworth it|really need (?:it|pro|the pro)|do (?:i|we) need (?:pro|the pro|it)|what does (?:the )?pro (?:plan )?(?:actually )?do|what do (?:i|we) get\b/i,
  scope: /\bleagues?\b|only (?:for )?parties|other questions|general questions|hours questions|non-?party|anything (?:else|besides)\b/i,
  billing: /\bbilled|billing|invoice|when (?:do|would|will) (?:i|we) (?:pay|get charged|be charged)|right away or|end of (?:the )?month|start(?:s)? charging|just start charging|check with (?:me|us)|auto(?:matically)? (?:charge|bill|renew)\b/i,
  leads: /\bwho gets|where do (?:the )?(?:requests|leads|inquiries) go|send (?:the )?(?:requests|leads|inquiries) to|my manager|our (?:events|event|party) (?:coordinator|manager|person)|notif|get (?:the )?(?:party )?(?:requests|leads|inquiries)|go to (?:my|our|her|his|their) (?:email|inbox)|both (?:of us|get)|more than one (?:email|person|address)\b/i,
} as const
type Topic = keyof typeof TOPICS

/** Topics the cost paragraph already answers, so they get no paragraph of their own. */
const IN_COST_LINE: Topic[] = ['plans']

const PRICE = /\$|\bcost|\bprice|\bpricing|how much|\bfee|\bcharge|\bpay\b|\bpaying|\bbill|\bfree month|\btrial\b|\bpilot\b|\bmonthly\b|\bper month\b|\ba month\b|\bdiscount|\brate\b|\bquote me\b|\bafford/i

export function sortReply(text: string): ReplyKind {
  const t = ownWords(text)
  if (!t) return 'unsure'
  const question = /\?/.test(t)
  const stop = STOP.test(t)
  // "Not interested in the pilot, but what's the monthly?" is a question, not a stop. A plain no is a stop.
  if (stop) return /\bbut\b[^.!]*\?/i.test(t) ? 'unsure' : 'stop'
  if (ALREADY.test(t) && !question && !YES.test(t)) return 'stop'
  const notYet = /\b(?:not|n'?t) (?:sure|ready|now|yet)\b|\bmaybe\b|\bnext (?:year|season|spring|summer|fall|winter)\b|\bbefore (?:i|we) (?:say yes|agree|sign|commit|decide|go ahead)|\byes or no\b/i
  if (YES.test(t) && !notYet.test(t)) return 'yes'
  if (PRICE.test(t) || Object.values(TOPICS).some((r) => r.test(t))) return 'price'
  return 'unsure'
}

function topicsIn(text: string): Topic[] {
  const t = ownWords(text)
  return (Object.keys(TOPICS) as Topic[]).filter((k) => TOPICS[k].test(t))
}

/** The owner's first name when they signed with one on its own line ("Thanks, Mike" or "- Dana"). */
export function signedName(text: string): string | null {
  const lines = ownWords(text).split('\n').map((l) => l.trim()).filter(Boolean)
  // A last line that names the venue ("Linda / Royal Scot") is not the person: look one line up.
  if (lines.length > 2 && !/^(?:thanks|thank you|cheers|best|regards|thx)/i.test(lines[lines.length - 1]) && /^[A-Z][a-z]{1,14}$/.test(lines[lines.length - 2].replace(/[,.!]+$/, ''))) {
    const prev = lines[lines.length - 2].replace(/[,.!]+$/, '')
    if (!/^(Thanks|Thank|Cheers|Best|Regards|Thx|Hello|Hi|Hey|Yes|No|Sure)$/.test(prev)) return prev
  }
  if (lines.length < 2) {
    const m = /(?:thanks|thank you|cheers|best|regards)[,!. -]+([A-Z][a-z]{1,14})\s*$/.exec(lines[0] ?? '')
    return m ? m[1] : null
  }
  const last = lines[lines.length - 1].replace(/^[-–—~\s]+/, '').replace(/[,.!]+$/, '')
  const m = /^(?:(?:thanks|thank you|cheers|best|regards|thx),?\s+)?([A-Z][a-z]{1,14})(?:\s+[A-Z][a-z]{1,20})?$/.exec(last)
  if (!m) return null
  if (/^(Thanks|Thank|Cheers|Best|Regards|Thx|Sent|Hello|Hi|Hey|Yes|No|Sure|Owner|Manager|Team)$/.test(m[1])) return null
  return m[1]
}

function costLine(o: OwnerOffer): string {
  const m = MONTHLY[o.currency]
  const pro = `${money(m.pro, o.currency)} a month for Pro, which also keeps your party prices and packages up to date for you each month`
  const starter = `${money(m.starter, o.currency)} a month for Starter, the chat on its own`
  const plans = o.lead === 'pro' ? `${pro}, or ${starter}` : `${starter}, or ${pro}`
  if (o.offer === 'pilot') {
    return `Nothing up front. For the first ${PILOT.days} days you pay ${money(PILOT.perRequestCents / 100, o.currency)} for each party request the chat takes for you, and never more than ${money(PILOT.monthlyCapCents / 100, o.currency)} in a month. After that it's ${plans}, if you keep it.`
  }
  return `The first month is free. After that it's ${plans}.`
}

function topicLine(t: Topic, o: OwnerOffer): string | null {
  const m = MONTHLY[o.currency]
  const pilot = o.offer === 'pilot'
  switch (t) {
    case 'contract':
      return pilot
        ? "There's no contract. It's month to month, and you can cancel any time by replying to this email. Cancel in the pilot and you pay only for requests already taken."
        : "There's no contract. It's month to month, and you can cancel any time by replying to this email. Cancel in the free month and you pay nothing at all."
    case 'card':
      return 'No card to start.'
    case 'billing':
      return pilot
        ? "After each month I email you the list of requests the chat took and the total, never more than the cap, and you pay that. Nothing moves to a monthly plan on its own: near the end of the 60 days I'll ask which plan you want, and if you don't pick one, the chat comes off and you owe nothing more."
        : "Nothing is billed in the free month. Near its end I'll email you to confirm you're keeping it before anything is charged. If you don't confirm, the chat comes off and you owe nothing."
    case 'setupFee':
      return pilot
        ? 'No setup fee and nothing else on top. The only charge in the pilot is the per-request price above.'
        : 'No setup fee and nothing else on top. The monthly price is the whole price.'
    case 'after':
      return pilot
        ? `After the ${PILOT.days} days you pick Pro or Starter if you want to keep it. Nothing switches over on its own, and if you don't pick, the chat comes off with nothing more to pay.`
        : "After the free month it's the monthly price. If you'd rather not keep it, tell me before the month is up and you pay nothing."
    case 'counts':
      return pilot
        ? 'A request counts only when a guest asks about a party or event and leaves a date, a headcount, their name and an email or phone. Someone who just asks a price and leaves no details costs you nothing. The same guest asking about the same date within a week counts once, and complaints never count.'
        : "There's no charge per request on your plan. It's one flat monthly price, however many requests the chat takes."
    case 'plans':
      return null
    case 'pick':
      return `You pick. Your email led with ${o.lead === 'pro' ? 'Pro' : 'Starter'}, but you choose either one in the box when you switch it on, and you can change plans any time by replying.`
    case 'worth':
      return `Pro is worth it if your packages or prices change often, or you'd rather not keep the chat's prices up to date yourself. If they change a couple of times a year, Starter (${money(m.starter, o.currency)} a month) is the better fit: reply with your new prices when they change and I'll update the chat. You can move to Pro any time.`
    case 'scope':
      return "It's built for parties and group events. Other questions, like leagues, it answers from your hours, your common-question answers and the pages you book elsewhere; anything it doesn't have, it says so and passes the guest to you with their details. You can add league answers in the setup any time."
    case 'site':
      return "It works on any website that lets you add a line of code. Most site builders have a spot for it, though some, like Wix, only allow it on a paid plan. If you'd rather not touch your site, we can install it for you, or send the line straight to whoever runs your site and work with them."
    case 'speed':
      return "It goes live the moment the line is on your site, so it can be answering guests today."
    case 'leads':
      return 'Each request comes to you by email with the guest\'s details. It goes to one address you choose, so for more than one person, use a shared inbox you both read, or set the first inbox to forward. Reply with the address and I\'ll set it.'
  }
}

/** A sentence the owner wrote as a question. */
function questions(text: string): string[] {
  return ownWords(text)
    .split(/(?<=[?.!])\s+|\n+/)
    .map((q) => q.trim())
    .filter((q) => /\?$/.test(q) || /^(?:what|why|how|when|where|who|which|is|are|do|does|did|can|could|will|would|should|any)\b/i.test(q))
}

/** Questions every draft answers without a topic line: the price and how to switch it on. */
const CORE = /\bwhat do you need (?:from|of) (?:me|us)|what(?:'s| is) next|\bhow much|\bcost|\bprice|\bpricing|what(?:'s| is) it|how (?:do|can) (?:i|we) (?:get|start|add|install|sign|set|put|turn|switch)|next steps?|send (?:it|over)|what do (?:i|we) do\b/i

/** Where the owner assumes the other offer, the answer says which one is theirs first. */
function offerCorrection(text: string, o: OwnerOffer): string | null {
  const t = ownWords(text)
  if (o.offer === 'free-month' && /\$20|per request|each request|60 days|sixty days|pilot/i.test(t)) {
    return "One thing first: your email offered the first month free, not the $20-a-request pilot, so there's no per-request charge for you."
  }
  if (o.offer === 'pilot' && /free month|first month free|month free|free trial/i.test(t)) {
    return "One thing first: your offer is the 60-day pilot rather than a free month, so you pay only for party requests the chat actually takes."
  }
  return null
}

const FOOTER = ['Alex', 'PartyDesk, an AKB Solutions product', '[mailing address]', "If this isn't for you, reply \"no thanks\" and I won't write again."].join('\n')

/** What to do with one owner reply. Nothing is sent from here; the plan says what to send, if anything. */
export function planReply(text: string, o: OwnerOffer, subject = ''): ReplyPlan {
  const kind = sortReply(text)
  const re = subject ? (/^re:/i.test(subject) ? subject : `Re: ${subject}`) : `Re: your PartyDesk demo for ${o.venueName}`
  if (kind === 'stop') {
    return { kind, email: null, doNotContact: true, stopSequence: true, needsPerson: false, why: 'Asked not to be written to. No email, logged do-not-contact.' }
  }
  if (kind === 'unsure') {
    return { kind, email: null, doNotContact: false, stopSequence: true, needsPerson: true, why: "Not a clear yes, price question or stop, so it isn't answered automatically." }
  }
  const signed = signedName(text)
  const name = signed && !o.venueName.toLowerCase().includes(signed.toLowerCase()) ? signed : null
  const hello = name ? `Hi ${name},` : 'Hi,'
  const topics = topicsIn(text)
  const unanswered = questions(text).filter((q) => !CORE.test(q) && !(Object.keys(TOPICS) as Topic[]).some((k) => TOPICS[k].test(q)))
  const correction = offerCorrection(text, o)
  // The billing answer already says what happens after the free month or the pilot.
  const skip: Topic[] = [...IN_COST_LINE, ...(topics.includes('billing') ? (['after'] as Topic[]) : [])]
  const extras = [...new Set(topics.filter((t) => !skip.includes(t)).map((t) => topicLine(t, o)).filter((l): l is string => !!l))]
  // A question with no written answer goes to a person with the draft, never out with the question dropped.
  const needsPerson = unanswered.length > 0
  const personWhy = needsPerson ? ` Held for a person: no written answer for "${unanswered.join('" / "')}".` : ''
  const planName = o.offer === 'pilot' ? 'the 60-day pilot' : o.lead === 'pro' ? 'Pro' : 'Starter (or Pro, if you want us to keep your prices up to date)'
  if (kind === 'yes') {
    const body = [
      hello,
      '',
      "Great, here's how to switch it on. It takes a few minutes and no call:",
      '',
      `1. Open your demo: ${o.demoUrl}`,
      "2. Ask it a few of your usual party questions. If anything is off, reply with the fix and I'll change it.",
      `3. In the "Put this chat on your website" box at the bottom, pick ${planName}, add your name and email, and press the button. You'll get one line of code to paste on your site, or to forward to whoever runs it.${topics.includes('site') ? '' : ' We can install it for you too.'}`,
      '',
      ...(correction ? [correction, ''] : []),
      costLine(o),
      ...extras.flatMap((e) => ['', e]),
      '',
      FOOTER,
    ]
    return { kind, email: { subject: re, text: body.join('\n') }, doNotContact: false, stopSequence: true, needsPerson, why: 'A yes: the steps to switch it on.' + personWhy }
  }
  const body = [
    hello,
    '',
    ...(correction ? [correction, ''] : []),
    costLine(o),
    ...extras.flatMap((e) => ['', e]),
    '',
    `If you want to try it, your demo is here: ${o.demoUrl}. The box at the bottom switches it on, no call needed.`,
    '',
    FOOTER,
  ]
  return { kind, email: { subject: re, text: body.join('\n') }, doNotContact: false, stopSequence: true, needsPerson, why: 'A price or terms question: answered from the offer in their email.' + personWhy }
}
