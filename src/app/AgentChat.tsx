'use client'

import { usePathname } from 'next/navigation'
import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { VENUE } from '@/lib/venue'

// Our own chat bubble for the dome agent (POST /api/agent), shown in place of
// the MyChatBot widget when DOME_AGENT_WIDGET=on. Same golfer launcher guests
// already know; behind it, the agent that can check dates, price a party and
// start the booking.
//
// The server is stateless: every send carries the visible conversation. It's
// kept in sessionStorage so moving between pages doesn't lose the chat, and
// dropped when the tab closes so nothing about a guest outlives their visit.

type Turn = { role: 'guest' | 'agent'; text: string }

const STORE = 'dome-agent-chat'
const WELCOME = `Hi, I'm Birdie! Planning a party or group outing? Tell me the date and how many people, and I'll check open times and prices.`
const TEASER = 'Planning a party? I can check dates and prices right now.'
// The route accepts at most 40 turns of up to 1500 characters each.
const MAX_TURNS = 40
const MAX_CHARS = 1500

function load(): Turn[] {
  try {
    const raw = sessionStorage.getItem(STORE)
    const turns = raw ? (JSON.parse(raw) as Turn[]) : []
    return Array.isArray(turns) ? turns : []
  } catch {
    return []
  }
}

function save(turns: Turn[]) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify(turns))
  } catch {
    /* private mode or full: the chat still works for this page */
  }
}

/** The agent writes plain text with full links; make those links clickable. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (!/^https?:\/\//.test(p)) return <Fragment key={i}>{p}</Fragment>
        // Trailing punctuation belongs to the sentence, not the link.
        const url = p.replace(/[.,!?;:]+$/, '')
        return (
          <Fragment key={i}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              {url}
            </a>
            {p.slice(url.length)}
          </Fragment>
        )
      })}
    </>
  )
}

export default function AgentChat({ embedded = false }: { embedded?: boolean }) {
  const pathname = usePathname()
  // Closed is the first render on server and client alike, and the closed
  // bubble shows none of this, so reading storage up front can't mismatch.
  const [turns, setTurns] = useState<Turn[]>(() => (typeof window === 'undefined' ? [] : load()))
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [teaserShown, setTeaserShown] = useState(false)
  const [dismissed, setDismissed] = useState(() => turns.length > 0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Staff screens don't need a sales bot, and the /embed.js iframe sits on a
  // host page that carries its own. The /chat.js iframe (embedded) is the
  // host page's bubble, so it always shows.
  const inFrame = useSyncExternalStore(
    () => () => {},
    () => window.self !== window.top,
    () => false,
  )
  const suppressed =
    !embedded && ((pathname?.startsWith('/admin') ?? false) || (pathname?.startsWith('/embed/') ?? false) || inFrame)
  const state = open ? 'open' : teaserShown ? 'teaser' : 'closed'

  // In the /chat.js iframe: tell the host page what's showing so it sizes the
  // frame to fit, and take the phone layout from the host's width, not the
  // frame's (a closed frame is narrower than any phone).
  useEffect(() => {
    if (!embedded) return
    const root = document.documentElement
    root.classList.add('dac-embed')
    const onHost = (e: MessageEvent) => {
      if (e.source !== window.parent || e.data?.type !== 'dome:chat-host') return
      root.classList.toggle('dac-m', Boolean(e.data.mobile))
    }
    window.addEventListener('message', onHost)
    return () => window.removeEventListener('message', onHost)
  }, [embedded])

  useEffect(() => {
    if (embedded) window.parent.postMessage({ type: 'dome:chat', state }, '*')
  }, [embedded, state])

  useEffect(() => {
    if (suppressed || dismissed) return
    const t = window.setTimeout(() => setTeaserShown(true), 5000)
    return () => window.clearTimeout(t)
  }, [suppressed, dismissed])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [turns, sending, open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const send = useCallback(async () => {
    const text = draft.trim().slice(0, MAX_CHARS)
    if (!text || sending) return
    const next: Turn[] = [...turns, { role: 'guest', text }]
    setTurns(next)
    save(next)
    setDraft('')
    setSending(true)
    let reply: string
    try {
      const r = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(-MAX_TURNS) }),
      })
      const j = r.ok ? await r.json() : null
      reply =
        j?.reply ??
        (r.status === 429
          ? `You're sending messages faster than I can keep up. Give it a few minutes, or call the dome at ${VENUE.phone}.`
          : `Sorry, I can't reply right now. Please call the dome at ${VENUE.phone}.`)
    } catch {
      reply = `Sorry, I can't reply right now. Please call the dome at ${VENUE.phone}.`
    }
    const done: Turn[] = [...next, { role: 'agent', text: reply }]
    setTurns(done)
    save(done)
    setSending(false)
  }, [draft, sending, turns])

  const openChat = useCallback(() => {
    setTeaserShown(false)
    setDismissed(true)
    setOpen(true)
  }, [])

  if (suppressed) return null

  return (
    <>
      <style precedence="default" href="dome-agent-chat" dangerouslySetInnerHTML={{ __html: CSS }} />

      {open ? (
        <section className="dac-panel" aria-label="Chat with Birdie">
          <header className="dac-head">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/birdie-avatar.png" alt="" width={36} height={36} />
            <div>
              <strong>Birdie</strong>
              <span>{VENUE.name}</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Minimise the chat">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </header>

          <div className="dac-list" ref={listRef} aria-live="polite">
            <p className="dac-msg dac-agent">{WELCOME}</p>
            {turns.map((t, i) => (
              <p key={i} className={`dac-msg dac-${t.role}`}>
                {t.role === 'agent' ? <Linkified text={t.text} /> : t.text}
              </p>
            ))}
            {sending && (
              <p className="dac-msg dac-agent dac-typing" aria-label="Birdie is typing">
                <span />
                <span />
                <span />
              </p>
            )}
          </div>

          <form
            className="dac-form"
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <textarea
              ref={inputRef}
              value={draft}
              maxLength={MAX_CHARS}
              rows={1}
              placeholder="Type a message"
              aria-label="Your message"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
            <button type="submit" disabled={sending || !draft.trim()} aria-label="Send">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M4 12l16-8-6 16-2-7-8-1z" fill="currentColor" />
              </svg>
            </button>
          </form>
        </section>
      ) : (
        <div className="dac-launcher-wrap">
          {teaserShown && (
            <button type="button" className="dac-teaser" onClick={openChat}>
              {TEASER}
            </button>
          )}
          <button type="button" className="dac-launcher" onClick={openChat} aria-label="Chat with Birdie about your party">
            <span className="dac-pulse" aria-hidden="true" />
            <span className="dac-disc">
              {/* Plain <img>: next/image flattens the animated WebP to one frame. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="dac-anim" src="/birdie-golfer.webp" alt="" width={72} height={72} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="dac-still" src="/birdie-golfer-still.svg" alt="" width={72} height={72} />
            </span>
          </button>
        </div>
      )}
    </>
  )
}

// Phone layout: by screen width on our own pages; in the /chat.js iframe, by
// the host page's width, which the host sends (dac-m).
const PHONE = (scope: string) => `
${scope} .dac-launcher{width:62px;height:62px}
${scope} .dac-teaser{display:none}
${scope} .dac-panel{right:8px;bottom:8px;width:calc(100vw - 16px);height:calc(100dvh - 16px)}
`

const CSS = `
.dac-launcher-wrap{position:fixed;right:20px;bottom:20px;z-index:2147483646;display:flex;align-items:flex-end;gap:10px}
.dac-launcher{position:relative;width:72px;height:72px;padding:0;border:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.dac-disc{position:absolute;inset:0;border-radius:50%;overflow:hidden;display:block;
  box-shadow:0 12px 28px rgba(0,0,0,.34),0 0 0 4px rgba(200,255,46,.22);transition:transform .18s ease}
.dac-launcher:hover .dac-disc{transform:scale(1.07)}
.dac-launcher:focus-visible .dac-disc{box-shadow:0 0 0 4px #fff,0 0 0 8px #c8ff2e}
.dac-disc img{width:100%;height:100%;display:block}
.dac-still{display:none}
.dac-pulse{position:absolute;inset:0;border-radius:50%;background:#c8ff2e;opacity:.4;animation:dac-pulse 2.6s ease-out infinite;pointer-events:none}
@keyframes dac-pulse{0%{transform:scale(1);opacity:.4}70%{transform:scale(1.6);opacity:0}100%{opacity:0}}
.dac-teaser{max-width:min(62vw,320px);margin-bottom:12px;background:#fff;color:#0b1622;font:600 13.5px/1.35 inherit;
  text-align:left;padding:10px 14px;border:0;cursor:pointer;border-radius:14px 14px 4px 14px;
  box-shadow:0 10px 26px rgba(0,0,0,.28);animation:dac-in .32s ease both}
@keyframes dac-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.dac-panel{position:fixed;right:20px;bottom:20px;z-index:2147483646;width:min(380px,calc(100vw - 32px));
  height:min(580px,calc(100dvh - 40px));display:flex;flex-direction:column;background:#fff;color:#0b1622;
  border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(0,0,0,.35);animation:dac-in .2s ease both;font-size:14.5px}
.dac-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#060b24;color:#fff}
.dac-head img{border-radius:50%}
.dac-head div{flex:1;display:flex;flex-direction:column;line-height:1.2}
.dac-head span{font-size:12px;opacity:.75}
.dac-head button{width:34px;height:34px;border:0;border-radius:50%;background:#c8ff2e;color:#0b1622;cursor:pointer;
  display:flex;align-items:center;justify-content:center}
.dac-list{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#f4f6fa}
.dac-msg{margin:0;max-width:85%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.4}
.dac-agent{align-self:flex-start;background:#fff;border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.dac-guest{align-self:flex-end;background:#060b24;color:#fff;border-bottom-right-radius:4px}
.dac-agent a{color:#0b6e4f;text-decoration:underline}
.dac-typing{display:flex;gap:4px;padding:12px}
.dac-typing span{width:7px;height:7px;border-radius:50%;background:#9aa3b5;animation:dac-dot 1.2s infinite ease-in-out}
.dac-typing span:nth-child(2){animation-delay:.15s}
.dac-typing span:nth-child(3){animation-delay:.3s}
@keyframes dac-dot{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
.dac-form{display:flex;gap:8px;padding:10px;border-top:1px solid #e3e7ef;background:#fff}
.dac-form textarea{flex:1;resize:none;border:1px solid #d5dbe6;border-radius:12px;padding:9px 11px;font:inherit;
  font-size:16px;max-height:120px;color:#0b1622;background:#fff}
.dac-form button{width:40px;border:0;border-radius:12px;background:#c8ff2e;color:#0b1622;cursor:pointer;
  display:flex;align-items:center;justify-content:center}
.dac-form button:disabled{opacity:.45;cursor:default}
@media (max-width:480px){${PHONE('html:not(.dac-embed)')}}
${PHONE('html.dac-m')}
@media (prefers-reduced-motion:reduce){
  .dac-pulse{animation:none;opacity:0}
  .dac-anim{display:none}
  .dac-still{display:block}
  .dac-teaser,.dac-panel{animation:none}
}
`
