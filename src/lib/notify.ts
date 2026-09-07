import { prisma } from '@/lib/db'
import { sendEmail, buildStaffNotification, splitRecipients } from '@/lib/email'

// Lives on its own rather than in booking.ts so the modules that only need to
// raise a staff alert — trackman, accounts — don't have to import the entire
// booking engine to do it. booking.ts now depends on the Trackman puller for the
// live checkout check, and leaving notifyStaff where it was would have closed
// that into an import cycle.

/** Best-effort staff notification (no-op when staffNotifyEmail is unset). */
export async function notifyStaff(input: {
  title: string
  lines: string[]
  adminPath: string
  urgent?: boolean
  actionUrl?: string
  actionLabel?: string
}) {
  try {
    const setting = await prisma.setting.findUnique({ where: { id: 1 } })
    // staffNotifyEmail holds one address or a comma-separated list, so the whole
    // events team gets bookings, payments, cancellations and review requests —
    // not just whoever's address happened to be set first.
    const to = splitRecipients(setting?.staffNotifyEmail)
    if (to.length === 0) return
    const email = buildStaffNotification(input)
    await sendEmail({ to, subject: email.subject, html: email.html, text: email.text })
  } catch (e) {
    console.error('staff notification failed', e)
  }
}
