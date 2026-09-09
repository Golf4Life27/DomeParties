import { prisma } from '@/lib/db'

// ---------------------------------------------------------------------------
// The terms a guest agrees to at checkout.
//
// What this is, precisely: the venue's published reservation policy, safety
// rules and bay rules. It is NOT a liability waiver drafted or reviewed by an
// insurer — it contains no release, no indemnity, and no assumption-of-risk
// clause. It is a large improvement on the placeholder it replaces, and it is
// not the same thing as being covered. The label on the booking page says
// "Reservation terms & safety rules" rather than "Liability waiver" for exactly
// that reason: calling it a waiver would misrepresent what a guest agreed to,
// which is the one thing a record like this must never do.
//
// Versions are immutable. Changing the terms means publishing a new row, so a
// booking from last March still points at the words that were on screen then.
// ---------------------------------------------------------------------------

export const CURRENT_WAIVER_VERSION = '2026-09-v1'

export const CURRENT_WAIVER_TITLE = 'Reservation terms & safety rules'

/**
 * Verbatim from the venue's published terms. Do not edit this constant to make
 * a change to the live terms — add a new version. Editing here would silently
 * rewrite what past customers are recorded as having agreed to.
 */
export const CURRENT_WAIVER_BODY = `RESERVATION POLICY
Online reservations take priority over walk-ins. Bay reservations start at the exact time of booking, regardless of whether your party is present or not. It is recommended to arrive 5 minutes prior to your booking to ensure you can start on time. Extensions of bays, rescheduling a booked time, and any last-minute changes to an existing reservation are subject to availability or the cancellation policy below.

CANCELLATION POLICY
If a reservation is prepaid and needs to be cancelled within 24 hours of your reservation, a credit will be placed on your account for future use at Whitetail Ridge Golf Dome. In that event, please call to make your next reservation so we can apply the credit. Reservations cancelled 24 hours or more prior may be refunded in full after 3–5 business days.

SAFETY & RESPONSIBILITY
Guests with reservations must adhere to Whitetail Ridge Golf Dome's safety rules listed below. Whitetail Ridge Golf Dome reserves the right to remove from the venue any guest who violates the safety rules. If injury should result because safety rules are not followed or are ignored, Whitetail Ridge Golf Dome will not be liable.

Everyone's safety is very important. By reserving a bay at Whitetail Ridge Golf Dome, all guests agree to abide by the following safety rules in addition to all verbal and posted instructions.

SAFETY RULES
1. All golfers must hit from the mat at all times. No running starts or horseplay.
2. Only the person hitting a ball should stand beyond the TV monitors. All other players should remain behind the TV monitors when a player is hitting. Players are responsible for the safety of others around them and should always check their surroundings before swinging a club.
3. Aim for the targets at all times. Aiming for the ball picker or intentionally hitting golf balls away from the range turf is strictly prohibited.
4. Guests must stay off the turf on the first level and behind the yellow line on the second level at all times. Please take extra care when playing from the upstairs bays.
5. Anyone under 16 must be supervised by a guest who is 21 or older at all times. Anyone under 18 must be supervised by a guest who is 21 or older after 9PM. If injury should result due to lack of supervision, Whitetail Ridge Golf Dome shall not be held liable.
6. Throwing golf balls is prohibited. Only dispense one golf ball at a time.
7. Whitetail Ridge Golf Dome is not responsible for lost or stolen items.
8. Using anything other than the rubber tees provided for hitting balls is prohibited.

SURVEILLANCE & DAMAGES
Whitetail Ridge Golf Dome is under 24-hour surveillance. When booking a bay, we ask that you follow all posted instructions inside the dome and on our website. Failure to do so may hold you liable for any damages or injuries caused in your bay or any surrounding bays.

BAY RULES
Only one person may swing at a time, and you may only hit one ball per shot (no pulling three balls and swinging rapid fire). If you aren't swinging, we ask that you stay behind the monitor and within the confines of your reserved bay. There may be a lot of people in both your own and the surrounding bays, so this is for everyone's safety. There are also many monitors, wires, TVs, safety netting and other equipment that are expensive, so we want to ensure everyone is vigilant about their surroundings.

2ND-LEVEL BAYS
All of the above rules apply. In addition, there is a yellow line running across all of the top-level bays before the safety netting. You may not step over that line for any reason. If something valuable falls into the safety nets, you must ask a staff member to help you retrieve it. Safety netting is in place for life-saving purposes and is only rated for one fall. If anyone falls into the netting it must then be replaced in its entirety. These costs will be assessed to anyone responsible for a fall into the protective netting.

If you have any questions about any rules, feel free to ask the check-in desk before heading to your bay.`

/**
 * The version shown to new customers. Falls back to the constants above when
 * the table has not been seeded yet, so the booking page never renders the
 * empty string where terms should be — a guest must never be asked to agree to
 * nothing.
 */
export async function activeWaiver(): Promise<{
  id: string | null
  version: string
  title: string
  body: string
}> {
  const row = await prisma.waiverVersion
    .findFirst({ where: { active: true }, orderBy: { effectiveFrom: 'desc' } })
    .catch(() => null)
  if (row) return { id: row.id, version: row.version, title: row.title, body: row.body }
  return {
    id: null,
    version: CURRENT_WAIVER_VERSION,
    title: CURRENT_WAIVER_TITLE,
    body: CURRENT_WAIVER_BODY,
  }
}

/**
 * Publish the current constants as a version if that version doesn't exist yet,
 * and make it the active one. Idempotent — safe to run on every seed.
 */
export async function seedWaiver(): Promise<{ waiverVersion: string }> {
  const existing = await prisma.waiverVersion.findUnique({
    where: { version: CURRENT_WAIVER_VERSION },
  })
  if (!existing) {
    // Only one version is ever active; stand the previous one down first.
    await prisma.waiverVersion.updateMany({ where: { active: true }, data: { active: false } })
    await prisma.waiverVersion.create({
      data: {
        version: CURRENT_WAIVER_VERSION,
        title: CURRENT_WAIVER_TITLE,
        body: CURRENT_WAIVER_BODY,
        active: true,
      },
    })
  }
  return { waiverVersion: CURRENT_WAIVER_VERSION }
}
