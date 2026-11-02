'use client'

// Outbound link that tells Meta and GA4 which button was pressed before the
// visitor leaves for TrackMan or their mail app. TrackMan doesn't report back
// to Meta, so these clicks are the only signal the everyday-golf ads get.

type Tracker = (...args: unknown[]) => void

export default function TrackedLink({
  href,
  event,
  className,
  children,
}: {
  href: string
  event: string
  className?: string
  children: React.ReactNode
}) {
  const external = href.startsWith('http')
  return (
    <a
      href={href}
      className={className}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      onClick={() => {
        try {
          const w = window as unknown as { fbq?: Tracker; gtag?: Tracker }
          w.fbq?.('trackCustom', 'PlayClick', { button: event })
          w.gtag?.('event', 'play_click', { button: event })
        } catch {
          // tracking must never block the click
        }
      }}
    >
      {children}
    </a>
  )
}
