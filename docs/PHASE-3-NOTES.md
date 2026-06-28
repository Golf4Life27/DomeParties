# Phase 3 (part 1) — Revenue layer

**Status: complete and verified.** Dynamic/peak pricing and deeper funnel analytics are
the remaining Phase 3 items.

This is where a custom engine beats off-the-shelf: revenue features engineered into the flow.

## Abandoned-cart recovery

Event carts abandon a lot; recovery is pure found revenue.

- Email is captured at **step 1** as a `DRAFT` booking (already true since Phase 1).
- **Resume link** — a recovery email links to `/book?draft=<id>`; the wizard **hydrates** the
  saved selections and drops the customer back at the first incomplete step.
- **`POST /api/cron/recovery`** — sends recovery emails to stale drafts (older than
  `?minutes=`, default 60; have an email; not already emailed). Idempotent via
  `recoveryEmailSentAt`. Protect with `CRON_SECRET`; wire to Vercel Cron.
- **Admin** — a "Send recovery email" button on any draft booking.

**Verified:** stale drafts → cron sends recovery emails with a working resume link,
`recoveryEmailSentAt` stamped, and a second run re-sends nothing (idempotent).

## Gift cards (cash up front)

- **Public `/gift`** — choose an amount (presets or custom), recipient + message, pay
  (Stripe Payment Elements, or dev fallback). On payment the card goes **ACTIVE** and the
  **recipient + purchaser are emailed** (recipient gets the code).
- **Redemption** — at Instant Book checkout, a gift code applies toward the **deposit due**.
  If it covers the deposit, the booking confirms with **nothing to charge**; otherwise the
  remainder is charged. The balance is **debited at confirmation** (not at apply, so abandoned
  attempts don't burn value) and partial balances remain usable.
- **Admin `/admin/gift-cards`** — list + **sold / outstanding-liability** totals.

**Verified:** bought a $250 card → redeemed $25.10 covering a 6-guest deposit → booking
**CONFIRMED** with $0 charged → gift balance debited to $224.90 (still ACTIVE).

## Social proof + urgency

- **`/api/stats`** — public `partiesThisMonth` / `totalConfirmed` (cached).
- **Landing** — "🎉 N parties booked this month" social-proof chip (shows at ≥3), a reviews
  row, and a **gift-card CTA**.
- **Urgency** — the date/time step already shows "Only N bays left" and "Prime time" badges.

## Schema additions (migration `revenue_layer`)

- `Booking.recoveryEmailSentAt`, `Booking.giftCardCode`, `Booking.giftCardApplied`
- `GiftCard` model + `GiftCardStatus` enum

## Notes / next

- **Cron**: add a Vercel Cron entry hitting `POST /api/cron/recovery` (with `CRON_SECRET`).
- **Remaining Phase 3:** dynamic/peak pricing (peak slots are already flagged in availability —
  wiring a price modifier is the next step) and deeper funnel analytics (step-level drop-off).
- **Phase 4:** Trackman/Google Calendar availability sync, all event types, and embedding the
  widget on the live site.
