'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'

// The chat for any venue: inline on the demo and setup pages, or floating as a
// bubble when a venue's website loads it through /venue-chat.js. It posts the
// visible conversation each time; the server keeps nothing.

type Turn = { role: 'guest' | 'agent'; text: string }

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (!/^https?:\/\//.test(p)) return <Fragment key={i}>{p}</Fragment>
        const url = p.replace(/[.,!?;:。、]+$/, '')
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

export default function VenueChat(props: {
  venueName: string
  welcome: string
  endpoint: string
  /** Extra fields sent with every message, such as a drafted setup to try. */
  extra?: Record<string, unknown>
  floating?: boolean
  accent?: string
  onCost?: (usage: { inputTokens: number; outputTokens: number }) => void
}) {
  const { venueName, welcome, endpoint, extra, floating = false, accent = '#0f766e', onCost } = props
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [open, setOpen] = useState(!floating)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [turns, sending])

  useEffect(() => {
    if (floating) window.parent.postMessage({ type: 'venue:chat', state: open ? 'open' : 'closed' }, '*')
  }, [floating, open])

  const send = useCallback(async () => {
    const text = draft.trim().slice(0, 1500)
    if (!text || sending) return
    const next: Turn[] = [...turns, { role: 'guest', text }]
    setTurns(next)
    setDraft('')
    setSending(true)
    let reply = 'Sorry, the chat is unavailable right now.'
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...extra, messages: next.slice(-20) }),
      })
      const j = await r.json().catch(() => null)
      reply = j?.reply ?? j?.error ?? reply
      if (j?.usage && onCost) onCost(j.usage)
    } catch {
      /* keep the fallback line */
    }
    setTurns([...next, { role: 'agent', text: reply }])
    setSending(false)
  }, [draft, sending, turns, endpoint, extra, onCost])

  if (floating && !open) {
    return (
      <button type="button" className="vc-launch" onClick={() => setOpen(true)} aria-label={`Chat with ${venueName}`} style={{ background: accent }}>
        <style precedence="default" href="venue-chat" dangerouslySetInnerHTML={{ __html: CSS }} />
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path d="M4 5h16v11H8l-4 4z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </button>
    )
  }

  return (
    <section className={`vc-panel${floating ? ' vc-float' : ''}`} aria-label={`Chat with ${venueName}`}>
      <style precedence="default" href="venue-chat" dangerouslySetInnerHTML={{ __html: CSS }} />
      <header className="vc-head" style={{ background: accent }}>
        <strong>{venueName}</strong>
        {floating && (
          <button type="button" onClick={() => setOpen(false)} aria-label="Minimise the chat">
            ✕
          </button>
        )}
      </header>
      <div className="vc-list" ref={listRef} aria-live="polite">
        <p className="vc-msg vc-agent">{welcome}</p>
        {turns.map((t, i) => (
          <p key={i} className={`vc-msg vc-${t.role}`} style={t.role === 'guest' ? { background: accent } : undefined}>
            {t.role === 'agent' ? <Linkified text={t.text} /> : t.text}
          </p>
        ))}
        {sending && <p className="vc-msg vc-agent vc-typing">…</p>}
      </div>
      <form
        className="vc-form"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about a party…" maxLength={1500} aria-label="Your message" />
        <button type="submit" disabled={sending || !draft.trim()} style={{ background: accent }}>
          Send
        </button>
      </form>
    </section>
  )
}

const CSS = `
.vc-panel{display:flex;flex-direction:column;height:520px;max-height:80vh;border:1px solid #d4d4d8;border-radius:16px;overflow:hidden;background:#fff;color:#18181b;font:15px/1.45 system-ui,sans-serif}
.vc-float{position:fixed;inset:auto 12px 12px auto;width:min(400px,calc(100vw - 24px));height:min(600px,calc(100vh - 24px));max-height:none;box-shadow:0 12px 40px rgba(0,0,0,.25)}
.vc-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;color:#fff}
.vc-head button{background:none;border:0;color:#fff;font-size:18px;cursor:pointer}
.vc-list{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#fafafa}
.vc-msg{margin:0;padding:8px 12px;border-radius:14px;max-width:85%;white-space:pre-wrap;overflow-wrap:anywhere}
.vc-agent{background:#fff;border:1px solid #e4e4e7;align-self:flex-start}
.vc-guest{color:#fff;align-self:flex-end}
.vc-agent a{color:#0f766e}
.vc-typing{opacity:.6}
.vc-form{display:flex;gap:8px;padding:10px;border-top:1px solid #e4e4e7;background:#fff}
.vc-form input{flex:1;min-width:0;padding:10px 12px;border:1px solid #d4d4d8;border-radius:10px;font:inherit}
.vc-form button{padding:0 16px;border:0;border-radius:10px;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.vc-form button:disabled{opacity:.5}
.vc-launch{position:fixed;right:16px;bottom:16px;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;display:grid;place-items:center;box-shadow:0 6px 20px rgba(0,0,0,.25)}
`
