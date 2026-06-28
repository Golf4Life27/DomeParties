# Phase 2 (part 1) — Admin dashboard

**Status: complete and verified.** The inquiry/lead flow + comms (the rest of Phase 2)
are the next slice.

## What's built

A role-gated admin at **`/admin`** so staff can run the business without touching code.

### Auth
- Password login → signed httpOnly session cookie (`src/lib/auth.ts`).
- `src/middleware.ts` protects all `/admin/*` pages and `/api/admin/*` routes; the login
  page/API are public. Unauthenticated page hits redirect to login; API hits return 401.
- Configurable via `ADMIN_PASSWORD` + `ADMIN_SESSION_TOKEN`. **Deliberately simple and
  clearly upgradeable** to real auth (e.g. Supabase Auth / SSO) later.

### Overview (`/admin`)
Revenue-funnel KPIs: **revenue booked, deposits collected, AOV, conversion %, upsell
take-rate + add-on revenue, in-progress, abandoned carts, new leads**, a visual
**booking funnel** (started → reached payment → confirmed), plus **upcoming events** and
**recent activity**.

### Bookings (`/admin/bookings`)
- Filterable list (All / Confirmed / Pending / Draft / Cancelled).
- Detail view (`/admin/bookings/[id]`): event, assigned bays, customer, **waiver status**,
  full money breakdown, and record/Stripe metadata.
- Actions: **Cancel** (frees the held bays) and **Mark completed**.

### Catalog & settings editors (no code needed)
- **Packages / Food & drink / Add-ons**: full create / edit / delete (auto-deactivates
  instead of deleting if a booking references the item). Prices edited in dollars.
- **Settings**: hours, guests-per-bay, turnover buffer, lead time, deposit %, service
  charge %, tax %, and cancellation policy — all live for new bookings immediately.
- Built on a reusable `CatalogEditor` driven by field descriptors.

## Verified

Auth gate (page 307 redirect / API 401), wrong-password rejection, login, **live settings
edit** (tax 7.25 → 8.25 → reset), overview KPIs rendering from real booking data, catalog
**create/delete** round-trip. The Phase 1 end-to-end booking shows correctly across the
dashboard (revenue, funnel, upcoming event, 100% upsell take-rate).

## Notes / next

- **Default admin password** is `dome-admin` in dev — set a strong `ADMIN_PASSWORD` and a
  random `ADMIN_SESSION_TOKEN` in production.
- **Next slice (Phase 2 part 2):** public **Inquiry/lead flow** (smart form → instant
  auto-response → staff proposal/quote → deposit link) with the leads surfaced in admin,
  then email/SMS **reminders**.
