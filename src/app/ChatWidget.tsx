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

/** The expanded panel is far bigger than the collapsed launcher row. */
function panelIsOpen(portal: Element): boolean {
  for (const el of Array.from(portal.querySelectorAll('*'))) {
    const r = el.getBoundingClientRect()
    if (r.height > 220 && r.width > 260) return true
  }
  return false
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
      const launcher = findLauncher(portal)
      launcherRef.current = launcher
      // Hide the whole collapsed ROW, not just the glyph — the row also holds
      // the vendor's pop-up pill, which would otherwise sit beside our button.
      const row = launcher?.parentElement
      if (row) row.setAttribute('data-dome-hidden', 'true')
      setReady(Boolean(launcher))
      setOpen(panelIsOpen(portal))
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
                  the visitor has asked for reduced motion. */}
              <img className="dome-anim" src="/birdie-golfer.webp" alt="" width={72} height={72} />
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
