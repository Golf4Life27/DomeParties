import type { Metadata } from 'next'
import Script from 'next/script'
import ChatWidget from './ChatWidget'
import AgentChat from './AgentChat'
import AttributionCapture from './AttributionCapture'
import './globals.css'

export const metadata: Metadata = {
  title: 'Whitetail Ridge Golf Dome — Book Your Event',
  description:
    'Book birthdays, group celebrations, and private events at Whitetail Ridge Golf Dome in Oswego, IL. Pick a date, choose a package, pay a deposit — done in minutes.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ga4 = process.env.NEXT_PUBLIC_GA4_ID
  const metaPixel = process.env.NEXT_PUBLIC_META_PIXEL_ID
  const chatAccount = process.env.NEXT_PUBLIC_MYCHATBOT_ACCOUNT_ID
  const chatWidget = process.env.NEXT_PUBLIC_MYCHATBOT_WIDGET_ID
  // The dome agent takes over the chat bubble only when its own switch is on
  // and the agent itself can answer; otherwise the MyChatBot widget stays.
  const agentChat =
    process.env.DOME_AGENT_WIDGET === 'on' && process.env.DOME_AGENT === 'on' && Boolean(process.env.ANTHROPIC_API_KEY)
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AttributionCapture />
        {children}
        {agentChat ? (
          <AgentChat />
        ) : (
          chatAccount && chatWidget && <ChatWidget accountId={chatAccount} widgetId={chatWidget} />
        )}
        {ga4 && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga4}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
// The /chat.js bubble iframe rides on every website page: no page views from it.
if (location.pathname.indexOf('/embed/') !== 0) gtag('config', '${ga4}');`}
            </Script>
          </>
        )}
        {metaPixel && (
          <Script id="meta-pixel" strategy="afterInteractive">
            {`if (location.pathname.indexOf('/embed/') !== 0) {
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${metaPixel}');
fbq('track', 'PageView');
}`}
          </Script>
        )}
      </body>
    </html>
  )
}
