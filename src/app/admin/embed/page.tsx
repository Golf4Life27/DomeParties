import { headers } from 'next/headers'
import CopyBlock from './CopyBlock'

export const dynamic = 'force-dynamic'

export default async function EmbedPage() {
  const h = await headers()
  const host = h.get('host') ?? 'your-domain.com'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  const origin = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`

  const scriptSnippet = `<!-- Whitetail Ridge Golf Dome — booking widget -->
<div id="whitetail-dome-booking"></div>
<script src="${origin}/embed.js" async></script>`

  const iframeSnippet = `<iframe
  src="${origin}/book?embed=1"
  title="Book your event at Whitetail Ridge Golf Dome"
  style="width:100%;border:0;min-height:720px"
></iframe>`

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-brand-dark">Embed the booking widget</h1>
      <p className="mt-1 text-foreground/60">
        Drop the booking flow straight into your website. Works on WordPress, Squarespace, Wix,
        or any HTML page.
      </p>

      <section className="mt-8">
        <h2 className="font-semibold text-brand-dark">Recommended: auto-resizing script</h2>
        <p className="mb-3 mt-1 text-sm text-foreground/60">
          Paste this where you want the widget to appear. It loads the booking flow and grows to
          fit — no scrollbars.
        </p>
        <CopyBlock code={scriptSnippet} />
      </section>

      <section className="mt-8">
        <h2 className="font-semibold text-brand-dark">Alternative: simple iframe</h2>
        <p className="mb-3 mt-1 text-sm text-foreground/60">
          No script — a fixed-height frame. Use if your CMS blocks custom scripts.
        </p>
        <CopyBlock code={iframeSnippet} />
      </section>

      <section className="mt-8 rounded-2xl bg-brand-light p-5 text-sm text-brand-dark">
        <h3 className="font-semibold">Direct links</h3>
        <ul className="mt-2 space-y-1">
          <li>Hosted booking page: <code className="rounded bg-white/60 px-1">{origin}/book</code></li>
          <li>Request-a-quote page: <code className="rounded bg-white/60 px-1">{origin}/inquire</code></li>
          <li>Gift cards: <code className="rounded bg-white/60 px-1">{origin}/gift</code></li>
        </ul>
        <p className="mt-3 text-xs text-foreground/60">
          Tip: for marketing buttons, link straight to these pages. The embed script is best for
          an inline booking experience on your homepage.
        </p>
      </section>
    </div>
  )
}
