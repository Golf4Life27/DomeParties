# Phase 2 — Admin dashboard + Inquiry flow

**Status: complete and verified.** Email/SMS reminders are the remaining polish item.

Acceptance criterion from the brief: *"an inquiry converts to a paid booking via a
staff-sent link."* ✅ Verified end-to-end (see "Inquiry flow" below).

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

## Inquiry flow (lead → quote → paid booking)

For corporate / league / large / custom events (the brief's second path):

- **Public `/inquire`** — a short, smart form (event type, flexible date, headcount range,
  budget band, must-haves, contact, message). The Instant Book wizard and the homepage now
  route bigger/custom events here.
- **`POST /api/leads`** — saves the lead and fires an **instant auto-response email**
  (speed-to-lead).
- **Admin `/admin/leads`** — list + detail with **status pipeline**
  (New → Contacted → Proposal sent → Won/Lost).
- **Send a quote** from a lead — staff set a total, date/time, duration, and party size;
  the system creates a **PENDING booking**, best-effort **holds bays**, advances the lead to
  *Proposal sent*, and **emails the customer a deposit pay link**.
- **Public `/pay/[id]`** — the customer reviews the quote and pays the deposit (Stripe
  Payment Elements, or dev fallback) → booking **CONFIRMED** + confirmation email.

### Verified end-to-end

```
public inquiry (Dana Lee, corporate, 40–60) → auto-response email
→ admin quote: $6,500 total, 9 bays held, lead → PROPOSAL_SENT, pay link + quote email
→ customer pays $650 deposit (10%) → booking CONFIRMED → confirmation email
3 emails fired: auto-response, quote+pay-link, confirmation ✅
```

## Notes / next

- **Default admin password** is `dome-admin` in dev — set a strong `ADMIN_PASSWORD` and a
  random `ADMIN_SESSION_TOKEN` in production.
- **Remaining Phase 2 polish:** email/SMS **reminders** (e.g. T-minus-7-day and day-before),
  and SMS confirmations via Twilio.
- **Phase 3 (revenue layer):** abandoned-cart recovery emails (drafts are already captured),
  gift cards, dynamic/peak pricing, social proof, deeper funnel analytics.
