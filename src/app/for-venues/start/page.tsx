import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { isPreview, venueProductOn } from '@/lib/venue-agent/gate'
import StartFlow from './StartFlow'

export const metadata: Metadata = {
  title: 'Start your free month',
  description: 'Give us your website and email. Your party chat is built from your site in about a minute.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

// Self-serve signup: website and email in, a working chat and its own link
// out, with no call and no person in between.
export default function Start() {
  if (!venueProductOn()) notFound()
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 80px', font: '16px/1.55 system-ui,sans-serif', color: '#18181b' }}>
      <p>
        <Link href="/for-venues">← About PartyDesk</Link>
      </p>
      <h1 style={{ fontSize: 30, lineHeight: 1.2, margin: '0 0 10px' }}>Start your free month</h1>
      <p style={{ margin: '0 0 20px' }}>Two boxes. We read your website and build your party chat from it, then you try it right here. No call, no setup fee, no contract.</p>
      <StartFlow showTiming={isPreview()} />
    </main>
  )
}
