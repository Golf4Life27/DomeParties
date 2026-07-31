'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useCallback, useRef } from 'react'
import { VENUE } from '@/lib/venue'

// MyChatBot website widget ("Birdie" — the event-sales assistant).
//
// mount() only needs to identify the widget: on load it fetches its own
// presentation settings (launcher position & margin, welcome/pop-up copy, logo,
// avatar) from api.mychatbot.app/sw-widget/metadata/<account>/<widget>. So the
// dashboard (Channels → Website Widget) stays the single source of truth for
// look and copy — deliberately don't duplicate those keys here, or dashboard
// edits would silently stop taking effect.
declare global {
  interface Window {
    MyChatBot?: { mount: (selector: string, options: Record<string, unknown>) => void }
  }
}

const WIDGET_CSS = 'https://storage.googleapis.com/mychatbot-widget-assets/v1/style.css'
const WIDGET_JS = 'https://storage.googleapis.com/mychatbot-widget-assets/v1/widget.js'
const MOUNT_ID = 'my-chat-widget-container'

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

  // Staff-facing screens don't need a sales bot following them around.
  if (pathname?.startsWith('/admin')) return null

  return (
    <>
      <link rel="stylesheet" href={WIDGET_CSS} precedence="default" />
      <div id={MOUNT_ID} />
      <Script src={WIDGET_JS} strategy="lazyOnload" onReady={mount} />
    </>
  )
}
