# Phase 1 — Core Instant Book (birthday parties)

**Status: complete and verified end-to-end (dev/test mode).**

Acceptance criterion from the brief: *"a real end-to-end test booking with a deposit
captured + a confirmation email."* ✅ Verified via an automated run (see below).

## What's built

A mobile-first, guest-checkout **Instant Book** flow on an internal managed calendar:

**Smart routing entry → package → date & time → food & drink → add-ons → details + e-waiver → deposit → instant confirmation.**

- **Smart routing:** event-type chips + party size at step 1. Corporate/League/Other
  show a "custom quote coming soon" nudge (the inquiry flow is Phase 2) but can still
  instant-book.
- **Tiered packages** with a "⭐ Most Popular" anchor (The Birdie / The Eagle / The Albatross).
- **Live, transparent order summary** updating on every change — line items, **service
  charge (20%)**, **sales tax shown up front**, total, **10% deposit due now**, balance
  at event, and an "≈ $X per guest, all-in" value line.
- **Availability** tied to 30 bays with a **30-min turnover buffer**, **9am–10pm** hours,
  and a **7-day online lead time**. Party size → bays (6/bay). "Only N left" urgency.
- **One-tap add-ons** (beverages first), with a quantity stepper for extra bay time.
- **E-waiver** step (sign-by-typing + parent/guardian option) — toggleable.
- **Deposit payment** via Stripe Payment Elements (when keys present) or a clearly
  labeled **dev simulated deposit** (when not), so the flow is testable today.
- **Instant confirmation** page + **confirmation email** with an **`.ics` calendar invite**.
- **No double-booking:** availability is recomputed from existing PENDING/CONFIRMED
  bookings + buffer, and concrete bays are assigned ("held") at checkout.

## Architecture highlights

- **Pluggable availability** (`src/lib/availability.ts`): ships `InternalAvailabilityProvider`;
  a Trackman / Google Calendar adapter can drop in behind the same interface later.
- **Money in integer cents** throughout; pricing is one pure engine (`src/lib/pricing.ts`).
- **Config as data:** hours, deposit/service/tax %, buffers, lead time, and the whole
  catalog live in the DB (`Setting` + tables), tunable without code.
- **Abandoned-cart ready:** email is captured at step 1 as a `DRAFT` booking (recovery
  emails are a Phase 3 fast-follow).

## Verified end-to-end (example run)

14-guest birthday, The Eagle + MVP Spread + Premium Bar + Birthday Cake:

```
draft (email capture) → selections → availability (22 slots, 10 days out)
→ checkout: total $1,575.96 · deposit $157.60 (10%) · balance $1,418.36 · 3 bays held
→ deposit paid → status CONFIRMED → confirmation email sent (with .ics)
no-double-book check: overlapping slots dropped 30→27 bays; clear slots stayed 30 ✅
```

## Known placeholders (intentional, per Alex)

- **Packages / F&B / add-ons / prices** are sensible placeholders — editable in the DB
  now, via an admin UI in Phase 2.
- **Tax rate** defaults to 7.25% (Oswego, IL) — confirm exact rate.
- **Waiver text** is placeholder — Alex to provide; the step is already wired.
- **Stripe** uses dev fallback until the Dome's test keys are added.

## Next (Phase 2 preview)

Inquiry/lead flow + auto-response, admin dashboard (manage catalog/availability,
view bookings & the revenue funnel, send quotes), and email/SMS reminders.
