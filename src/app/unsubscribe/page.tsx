import Link from 'next/link'

export const dynamic = 'force-dynamic'

// Unsubscribe from unfinished-booking reminders. The emailed link opens this page
// and the guest presses a button; the page itself changes nothing, so an email
// scanner that "clicks" every link can't unsubscribe anyone by accident.
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string; t?: string; done?: string; bad?: string }>
}) {
  const { b, t, done, bad } = await searchParams
  return (
    <main className="flex-1">
      <header className="bg-brand-dark text-white">
        <div className="mx-auto max-w-2xl px-6 py-4">
          <Link href="/" className="font-bold">Whitetail Ridge Golf Dome</Link>
        </div>
      </header>
      <div className="mx-auto max-w-xl px-6 py-12">
        {done ? (
          <>
            <h1 className="text-3xl font-bold text-brand">You&apos;re unsubscribed</h1>
            <p className="mt-3 text-foreground/70">
              We won&apos;t send you any more reminders about unfinished bookings. If you book a party,
              you&apos;ll still get your confirmation.
            </p>
          </>
        ) : bad || !b || !t ? (
          <>
            <h1 className="text-3xl font-bold text-brand">That link didn&apos;t work</h1>
            <p className="mt-3 text-foreground/70">
              Reply to any of our emails and we&apos;ll take you off the list.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-brand">Stop booking reminders?</h1>
            <p className="mt-3 text-foreground/70">
              We&apos;ll stop emailing you about the party you started but didn&apos;t finish.
            </p>
            <form method="post" action="/api/unsubscribe" className="mt-6">
              <input type="hidden" name="b" value={b} />
              <input type="hidden" name="t" value={t} />
              <button
                type="submit"
                className="rounded-full bg-brand px-6 py-3 font-bold text-brand-dark"
              >
                Unsubscribe me
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
