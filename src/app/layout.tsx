import type { Metadata } from 'next'
import Script from 'next/script'
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
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        {ga4 && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga4}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${ga4}');`}
            </Script>
          </>
        )}
        {metaPixel && (
          <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${metaPixel}');
fbq('track', 'PageView');`}
          </Script>
        )}
      </body>
    </html>
  )
}
