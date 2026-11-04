import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { listVenues } from '@/venues'
import { venueProductOn } from '@/lib/venue-agent/gate'
import SetupFlow from './SetupFlow'

export const metadata: Metadata = {
  title: 'After-hours party booking chat for venues',
  description: 'Answers and prices every party inquiry on your website, day or night, and sends guests to book.',
}

// Read per request, so switching the product on or off needs no rebuild.
export const dynamic = 'force-dynamic'

// The offer, the samples and the setup, on one page. Off with the product.
export default async function ForVenues() {
  if (!venueProductOn()) notFound()
  const h = await headers()
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`
  return (
    <main className="fv">
      <style precedence="default" href="for-venues" dangerouslySetInnerHTML={{ __html: CSS }} />
      <section className="fv-hero">
        <h1>Party inquiries answered and priced at 11pm. Booked by morning.</h1>
        <p>
          Most party questions arrive after your staff go home. This chat answers them on your website the moment they come in: your hours, your
          packages, the exact price for their group and date, and a link to book and pay the deposit. Anything it can’t answer goes to your inbox
          with the guest’s details.
        </p>
        <p className="fv-price">
          <strong>$499 a month.</strong> First month free. No setup fee, no contract, cancel any time.
        </p>
        <a href="#setup" className="fv-cta">
          Set it up in two minutes
        </a>
      </section>

      <section className="fv-three">
        <div>
          <h3>1. Give us your website</h3>
          <p>We read it and set up your chat: hours, packages, prices, booking link. No forms, no calls.</p>
        </div>
        <div>
          <h3>2. Check it and try it</h3>
          <p>One short page to fix anything we got wrong, then chat with it yourself as a guest.</p>
        </div>
        <div>
          <h3>3. Paste one line</h3>
          <p>One line on your website, or we install it. Price changes later never need your web person again.</p>
        </div>
      </section>

      <section className="fv-proof">
        <h2>Built and proven at a real golf dome</h2>
        <p>
          It runs on a golf dome’s own party booking site, tested on that dome’s real guest chats: it checked dates against the calendar, caught a
          wrong weekday, priced a 30-person party with its deposit, and passed lessons questions to staff instead of guessing. Each chat costs
          about 4½ cents to run, so you pay for bookings, not for a call center.
        </p>
        <p>It works for golf domes, simulator lounges, ranges, bowling centers and family entertainment centers, in your language and currency.</p>
      </section>

      <section className="fv-samples">
        <h2>Try a sample venue</h2>
        <ul>
          {listVenues().map((v) => (
            <li key={v.slug}>
              <Link href={`/for-venues/demo/${v.slug}`}>{v.name}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="setup" className="fv-setup">
        <h2>Set up your chat</h2>
        <SetupFlow origin={origin} />
      </section>

      <section className="fv-faq">
        <h2>Questions owners ask</h2>
        <h4>Does it take payments?</h4>
        <p>It sends guests to your own booking page, where they pay your deposit exactly as they do today. It never touches money.</p>
        <h4>What if it doesn’t know an answer?</h4>
        <p>It says so, asks for the guest’s email or phone, and sends you the lead. It never makes up a price or a policy.</p>
        <h4>Can I change prices or hours?</h4>
        <p>Email us the change, or update your website and ask us to re-read it. It’s live within a day, with nothing to edit on your site.</p>
      </section>
    </main>
  )
}

const CSS = `
.fv{max-width:1080px;margin:0 auto;padding:32px 20px 80px;font:16px/1.55 system-ui,sans-serif;color:#18181b}
.fv h1{font-size:clamp(28px,5vw,44px);line-height:1.15;margin:0 0 16px}
.fv-hero p{max-width:720px}
.fv-price{font-size:18px}
.fv-cta{display:inline-block;margin-top:8px;padding:12px 22px;border-radius:12px;background:#0f766e;color:#fff;font-weight:600;text-decoration:none}
.fv-three{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin:40px 0}
.fv-three div,.sf-card{border:1px solid #e4e4e7;border-radius:16px;padding:18px;background:#fff;margin-bottom:16px}
.fv-three h3,.sf-card h3{margin:0 0 6px}
.fv-samples ul{display:flex;flex-wrap:wrap;gap:10px;list-style:none;padding:0}
.fv-samples a{display:inline-block;padding:8px 14px;border:1px solid #0f766e;border-radius:999px;color:#0f766e;text-decoration:none}
.sf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.sf-card label{display:block;margin:10px 0;font-weight:600;font-size:14px}
.sf-card input,.sf-card textarea{display:block;width:100%;margin-top:4px;padding:10px 12px;border:1px solid #d4d4d8;border-radius:10px;font:inherit;font-weight:400;box-sizing:border-box}
.sf-card button{margin-top:8px;padding:12px 20px;border:0;border-radius:12px;background:#0f766e;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.sf-card button:disabled{opacity:.5}
.sf-list{list-style:none;padding:0;margin:0;font-size:14px}
.sf-list li{padding:4px 0;border-bottom:1px solid #f4f4f5}
.sf-list span{display:inline-block;min-width:44px;font-weight:600}
.sf-card .sf-num{display:inline-block;width:100px;margin:0;padding:4px 8px}
.sf-unsure{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 10px 10px 28px;font-size:14px}
.sf-error{color:#b91c1c}
.sf-card .sf-link{background:none;color:#0f766e;padding:0;margin:0;font-weight:500;text-decoration:underline}
.sf-code{white-space:pre-wrap;word-break:break-all;background:#f4f4f5;padding:12px;border-radius:10px;font-size:13px}
`
