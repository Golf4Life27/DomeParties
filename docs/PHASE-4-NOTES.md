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

## Remaining Phase 4

- **Availability sync** — adapter behind the existing `AvailabilityProvider` interface for
  Trackman (no public booking API confirmed — likely a Google Calendar mirror or manual
  staff holds) so events respect open-play bay inventory. Pluggable seam is already in place.
- **Go-live** — deploy to Vercel + Supabase, wire the Dome's Stripe live keys + Resend, load
  real packages/pricing/brand via admin, and drop the embed snippet on the live site.
- **Hardening** — set `frame-ancestors` CSP to the venue's domain(s) for the embed.
