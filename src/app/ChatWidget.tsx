'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { VENUE } from '@/lib/venue'

// MyChatBot website widget ("Birdie" — the event-sales assistant).
//
// mount() only needs to identify the widget: on load it fetches its own
// presentation settings (launcher position & margin, welcome/pop-up copy, logo,
// avatar) from api.mychatbot.app/sw-widget/metadata/<account>/<widget>. So the
// dashboard (Channels → Website Widget) stays the single source of truth for
// look and copy — deliberately don't duplicate those keys here, or dashboard
// edits would silently stop taking effect.
//
// CUSTOM LAUNCHER
// The vendor's collapsed launcher is a 48px stock chat glyph and it never
// renders the `logo` field — that only appears once the panel is open. So the
// one thing a customer sees before engaging cannot be branded through the
// dashboard at all. We hide the vendor's collapsed row and render our own
// animated golfer in its place, forwarding clicks to the real launcher so the
// panel, chat history and every dashboard setting behave exactly as before.
declare global {
  interface Window {
    MyChatBot?: { mount: (selector: string, options: Record<string, unknown>) => void }
  }
}

const WIDGET_CSS = 'https://storage.googleapis.com/mychatbot-widget-assets/v1/style.css'
const WIDGET_JS = 'https://storage.googleapis.com/mychatbot-widget-assets/v1/widget.js'
const MOUNT_ID = 'my-chat-widget-container'

// The vendor teleports its UI into this node on <body> — not into MOUNT_ID.
const PORTAL_ID = 'mcb-widget-portal'
// The collapsed launcher: a sized <svg> inside a clickable wrapper.
const LAUNCHER_SEL = 'svg[class*="mcb-size-"]'

/**
 * The expanded panel, or null when collapsed — it's far bigger than the
 * launcher row, so the largest box in the portal is the panel itself.
 */
function findPanel(portal: Element): HTMLElement | null {
  let best: HTMLElement | null = null
  let area = 0
  for (const el of Array.from(portal.querySelectorAll('*'))) {
    const r = el.getBoundingClientRect()
    if (r.height > 220 && r.width > 260 && r.width * r.height > area) {
      area = r.width * r.height
      best = el as HTMLElement
    }
  }
  return best
}

function findLauncher(portal: Element): HTMLElement | null {
  const svg = portal.querySelector(LAUNCHER_SEL)
  if (!svg) return null
  const clickable = svg.closest('.mcb-cursor-pointer')
  return (clickable as HTMLElement) ?? (svg.parentElement as HTMLElement | null)
}

export default function ChatWidget({
  accountId,
  widgetId,
  color = '#c8ff2e', // brand neon lime
}: {
  accountId: string
  widgetId: string
  color?: string
}) {
  const pathname = usePathname()
  const mounted = useRef(false)
  const launcherRef = useRef<HTMLElement | null>(null)

  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const [teaser, setTeaser] = useState<string | null>(null)
  const [teaserShown, setTeaserShown] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null)

  const suppressed = pathname?.startsWith('/admin') ?? false

  const mount = useCallback(() => {
    // onReady fires again on re-mount; mounting twice would stack two bubbles.
    if (mounted.current) return
    // Never inside the /embed.js iframe — the host page carries its own widget.
    if (typeof window !== 'undefined' && window.self !== window.top) return
    if (!window.MyChatBot) return
    mounted.current = true
    window.MyChatBot.mount(`#${MOUNT_ID}`, {
      account_id: accountId,
      widget_id: widgetId,
      api_url: 'https://api.mychatbot.app',
      assistant_name: 'Birdie',
      color,
      lang: 'en',
      // Birdie's face on every reply. The vendor default is a stock photo of an
      // older woman; anything starting with http is used verbatim once it loads
      // (and silently falls back to that default if it 404s), so point it at our
      // own golfer. Absolute URL required — a bare path is treated as the name
      // of one of their built-in avatars.
      assistant_avatar: `${window.location.origin}/birdie-avatar.png`,
      // MUST be set. Left unset, the widget falls back to a Vue prop default
      // holding the vendor's own demo socials (lighthouse.kyiv.ua), so the
      // Dome's chat panel would link customers to an unrelated business. It has
      // no metadata field and no MCP parameter, so here is the only place to
      // set it. Facebook only — it's the Dome's active channel.
      sm_pages: [{ name: 'Facebook', url: VENUE.facebook }],
    })
  }, [accountId, widgetId, color])

  // Take over the launcher: hide the vendor's collapsed row, track open state.
  useEffect(() => {
    if (suppressed) return
    if (typeof window !== 'undefined' && window.self !== window.top) return

    let observer: MutationObserver | null = null
    let poll = 0
    let tries = 0

    const sync = (portal: Element) => {
      const panel = findPanel(portal)
      const isOpen = Boolean(panel)
      const launcher = findLauncher(portal)

      // Only ever remember the COLLAPSED-state launcher. It's a toggle, so the
      // same node both opens and closes the panel. While open the same selector
      // resolves to the header's expand icon instead, and clicking that would
      // blow the panel up rather than shrink it.
      if (!isOpen && launcher) launcherRef.current = launcher

      // Where to float our own minimise button: just above the panel's top-right
      // corner, so it never lands on the vendor's own header icons or the
      // message box.
      if (panel) {
        const r = panel.getBoundingClientRect()
        setAnchor({ right: Math.max(8, window.innerWidth - r.right), top: Math.max(8, r.top - 46) })
      }

      // Hide the vendor's row ONLY while collapsed. Once the panel opens the
      // vendor moves its minimise control into that same row, so leaving it
      // hidden takes away the only way to shrink the chat back down. Our own
      // launcher is hidden while open, so handing the row back can't produce
      // two buttons. Clear every marked node, not just this one — which element
      // holds the control differs between the two states.
      if (isOpen) {
        document
          .querySelectorAll('[data-dome-hidden]')
          .forEach((el) => el.removeAttribute('data-dome-hidden'))
      } else {
        // Write only when it would actually change. setAttribute queues a
        // mutation record even when the value is identical, so an unconditional
        // write re-fires this very observer — and because observer callbacks
        // are microtasks, that starves the event loop and hangs the tab.
        const row = launcher?.parentElement
        if (row && row.getAttribute('data-dome-hidden') !== 'true') {
          row.setAttribute('data-dome-hidden', 'true')
        }
      }

      // The vendor's portal carries an inline z-index of 2147483647 — the 32-bit
      // maximum — so our launcher can never sit above it, and its container
      // swallows the clicks aimed at our golfer. While collapsed nothing in the
      // portal needs to be clickable (its own row is hidden), so let clicks fall
      // through to us; restore interactivity the moment the panel opens.
      // Forwarding still works either way: element.click() ignores pointer-events.
      const pass = isOpen ? null : 'true'
      if (portal.getAttribute('data-dome-passthrough') !== pass) {
        if (pass) portal.setAttribute('data-dome-passthrough', pass)
        else portal.removeAttribute('data-dome-passthrough')
      }

      setReady(Boolean(launcherRef.current))
      setOpen(isOpen)
    }

    const attach = () => {
      const portal = document.getElementById(PORTAL_ID)
      if (!portal) return false
      sync(portal)
      observer = new MutationObserver(() => sync(portal))
      observer.observe(portal, { childList: true, subtree: true, attributes: true })
      return true
    }

    if (!attach()) {
      poll = window.setInterval(() => {
        tries += 1
        if (attach() || tries > 60) window.clearInterval(poll)
      }, 500)
    }

    return () => {
      observer?.disconnect()
      if (poll) window.clearInterval(poll)
    }
  }, [suppressed])

  // Teaser copy comes from the dashboard, same as every other presentation
  // setting — don't hardcode it here or dashboard edits stop taking effect.
  useEffect(() => {
    if (suppressed || !ready) return
    let cancelled = false
    fetch(`https://api.mychatbot.app/sw-widget/metadata/${accountId}/${widgetId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const text = j?.metadata?.pop_up_text
        if (!cancelled && typeof text === 'string' && text.trim()) setTeaser(text)
      })
      .catch(() => {
        /* no teaser is fine — the launcher still works */
      })
    return () => {
      cancelled = true
    }
  }, [accountId, widgetId, ready, suppressed])

  useEffect(() => {
    if (!teaser || dismissed) return
    const t = window.setTimeout(() => setTeaserShown(true), 5000)
    return () => window.clearTimeout(t)
  }, [teaser, dismissed])

  const collapseChat = useCallback(() => {
    launcherRef.current?.click()
  }, [])

  const openChat = useCallback(() => {
    setTeaserShown(false)
    setDismissed(true)
    launcherRef.current?.click()
  }, [])

  // Staff-facing screens don't need a sales bot following them around.
  if (suppressed) return null

  const showLauncher = ready && !open

  return (
    <>
      <link rel="stylesheet" href={WIDGET_CSS} precedence="default" />
      <style
        precedence="default"
        href="dome-chat-launcher"
        dangerouslySetInnerHTML={{ __html: LAUNCHER_CSS }}
      />
      <div id={MOUNT_ID} />

      {open && anchor && (
        <button
          type="button"
          className="dome-minimise"
          style={{ right: anchor.right, top: anchor.top }}
          onClick={collapseChat}
          aria-label="Minimise the chat"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M5 9l7 7 7-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {showLauncher && (
        <div className="dome-launcher-wrap">
          {teaserShown && teaser && (
            <button
              type="button"
              className="dome-teaser"
              onClick={openChat}
              aria-label={teaser}
            >
              {teaser}
            </button>
          )}
          <button
            type="button"
            className="dome-launcher"
            onClick={openChat}
            aria-label="Chat with Birdie about your party"
          >
            <span className="dome-pulse" aria-hidden="true" />
            <span className="dome-disc">
              {/* Animated for most visitors; the still is swapped in by CSS when
                  the visitor has asked for reduced motion. Plain <img> on
                  purpose: next/image re-encodes, which flattens the animated
                  WebP to a single frame and rasterises the SVG. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="dome-anim" src="/birdie-golfer.webp" alt="" width={72} height={72} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="dome-still" src="/birdie-golfer-still.svg" alt="" width={72} height={72} />
            </span>
          </button>
        </div>
      )}

      <Script src={WIDGET_JS} strategy="lazyOnload" onReady={mount} />
    </>
  )
}

const LAUNCHER_CSS = `
[data-dome-hidden="true"]{visibility:hidden!important;pointer-events:none!important}
.dome-minimise{position:fixed;z-index:2147483647;width:38px;height:38px;padding:0;border:0;
  border-radius:50%;background:#c8ff2e;color:#0b1622;cursor:pointer;display:flex;
  align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.dome-minimise:hover{transform:scale(1.06)}
.dome-minimise:focus-visible{outline:3px solid #fff;outline-offset:2px}
#${PORTAL_ID}[data-dome-passthrough="true"]{pointer-events:none!important}
.dome-launcher-wrap{position:fixed;right:20px;bottom:20px;z-index:2147483646;
  display:flex;align-items:flex-end;gap:10px}
.dome-launcher{position:relative;width:72px;height:72px;padding:0;border:0;
  background:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.dome-disc{position:absolute;inset:0;border-radius:50%;overflow:hidden;display:block;
  box-shadow:0 12px 28px rgba(0,0,0,.34),0 0 0 4px rgba(200,255,46,.22);
  transition:transform .18s ease}
.dome-launcher:hover .dome-disc{transform:scale(1.07)}
.dome-launcher:focus-visible .dome-disc{box-shadow:0 0 0 4px #fff,0 0 0 8px #c8ff2e}
.dome-disc img{width:100%;height:100%;display:block}
.dome-still{display:none}
.dome-pulse{position:absolute;inset:0;border-radius:50%;background:#c8ff2e;opacity:.4;
  animation:dome-pulse 2.6s ease-out infinite;pointer-events:none}
@keyframes dome-pulse{0%{transform:scale(1);opacity:.4}70%{transform:scale(1.6);opacity:0}
  100%{opacity:0}}
.dome-teaser{max-width:min(62vw,320px);margin-bottom:12px;background:#fff;color:#0b1622;
  font:600 13.5px/1.35 inherit;text-align:left;padding:10px 14px;border:0;cursor:pointer;
  border-radius:14px 14px 4px 14px;box-shadow:0 10px 26px rgba(0,0,0,.28);
  animation:dome-teaser-in .32s ease both}
@keyframes dome-teaser-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (max-width:480px){
  .dome-launcher{width:62px;height:62px}
  .dome-teaser{display:none}
}
@media (prefers-reduced-motion:reduce){
  .dome-pulse{animation:none;opacity:0}
  .dome-anim{display:none}
  .dome-still{display:block}
  .dome-teaser{animation:none}
}
`
