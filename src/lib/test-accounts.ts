/**
 * Staff and test bookings live in the same tables as real families. Counting
 * them made the Overview and the public "parties booked" line wrong in both
 * directions, so every headline number filters them out here.
 *
 * A booking counts as a test when its email is on one of the venue's own
 * domains, a reserved test domain, or listed in STAFF_TEST_EMAILS
 * (comma-separated, optional).
 */
const TEST_DOMAINS = ['whitetailridgegc.com', 'akb-properties.com', 'test.local', 'example.com', 'example.org']

function extraTestEmails(): Set<string> {
  return new Set(
    (process.env.STAFF_TEST_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isTestEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.trim().toLowerCase()
  if (extraTestEmails().has(e)) return true
  const domain = e.split('@')[1] ?? ''
  return TEST_DOMAINS.includes(domain)
}
