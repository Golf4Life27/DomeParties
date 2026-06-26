import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Whitetail Ridge Golf Dome — Book Your Event',
  description:
    'Book birthdays, group celebrations, and private events at Whitetail Ridge Golf Dome in Oswego, IL. Pick a date, choose a package, pay a deposit — done in minutes.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
