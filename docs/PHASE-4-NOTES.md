# Phase 4 (part 1) — Embeddable booking widget

**Status: complete and verified.** Availability sync (Trackman/Google Calendar) and the
live-site go-live are the remaining Phase 4 items.

The brief calls for "a hosted booking page **and** an embed snippet / web component the
marketing site can drop in." Both now exist.

## What's built

- **`/embed.js`** — a tiny loader the marketing site includes. It injects an iframe of
  `/book?embed=1` into a `#whitetail-dome-booking` div (or wherever the script sits) and
  **auto-resizes** it via `postMessage` (no scrollbars). Cross-origin safe (checks origin).
- **`/book?embed=1`** — the booking flow with the site header hidden, so it sits cleanly
  inside the host page. Posts its height to the parent on every step/resize.
- **Admin → Embed** (`/admin/embed`) — copy-paste snippets:
  - Recommended **auto-resizing script** (`<div id="whitetail-dome-booking"></div>` + `<script src=".../embed.js" async>`)
  - Alternative **plain iframe** (for CMSes that block scripts)
  - Direct links to the hosted `/book`, `/inquire`, and `/gift` pages.

Works on WordPress (the venue's platform), Squarespace, Wix, or any HTML page.

## Verified

- `/embed.js` serves `application/javascript` with the correct origin baked in.
- `/book?embed=1` renders the wizard with the site header removed (confirmed visually).
- Admin Embed page renders both snippets with the deployment's origin.

## Conflict-safe inventory (no Trackman integration needed)

Because Trackman Booking & Payments has no public booking API, the engine can't sync in
real time — so it controls **which physical bays it's allowed to confirm**:

- Each bay is **Exclusive** (engine-owned) or **Shared** (also bookable in Trackman),
  toggled in **admin → Bays**. Default: all Shared (zero conflict out of the box).
- `assignBays` prefers Exclusive bays and reports if any Shared bay was used.
- On deposit: **Exclusive-only → instant CONFIRMED**; **any Shared bay → deposit captured,
  booking held `needsReview`** with a "deposit received" email. Staff check Trackman and hit
  **Confirm** (admin → Bookings → Needs review) to finalize + send the confirmation.
- To enable instant self-serve, dedicate a block of bays as Exclusive (pull them from
  Trackman open-play). Verified both paths end-to-end.

## Remaining Phase 4

- **Optional availability sync** — a Google Calendar adapter behind `AvailabilityProvider`
  as a softer advisory layer if Trackman can export. Not required now that Exclusive/Shared
  prevents conflicts.
- **Go-live** — deploy to Vercel + Supabase, wire the Dome's Stripe live keys + Resend, load
  real packages/pricing/brand via admin, and drop the embed snippet on the live site.
- **Hardening** — set `frame-ancestors` CSP to the venue's domain(s) for the embed.
