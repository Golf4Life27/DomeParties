# Whitetail Ridge Golf Dome — Event Booking Engine
## Phase 0 Deliverable: Research & Recommended Flow Design (v1.0)

> **Status: awaiting Alex's sign-off.** Per the build brief, no application code is written
> until the flow design + revenue shortlist below are approved. This document is the Phase 0
> deliverable: (1) best-of patterns to emulate, (2) anti-patterns to avoid, (3) recommended
> step-by-step flows for Instant Book and Inquiry, (4) a revenue-feature shortlist prioritized
> by impact/effort, plus the availability-integration reality and open questions.

---

## 0. TL;DR — what we should build

A custom, **on-site overlay** booking engine that:

1. **Routes by headcount/event type** — small birthdays/groups self-serve via **Instant Book**; large/corporate/buyout/custom route to **Inquiry → quote → deposit link**. Customer can always override.
2. **Sells with a headcount-aware, tiered package builder** (Good/Better/Best, middle anchored "Most Popular"), then **one-tap add-ons at the perfect moment** (after package, before payment).
3. **Locks revenue with a deposit** (stored card for the day-of balance), e-waiver at booking, instant confirmation + calendar invite + reminders.
4. **Engineers revenue into every step** — the Topgolf "minimum = credit you spend on yourselves" framing, abandoned-cart recovery, gift cards, social proof, post-booking upsell, and a full funnel dashboard.
5. **Owns its economics** — raw Stripe pricing only, **no per-booking/per-cover surcharge** (the thing every off-the-shelf tool taxes you on).

**Availability reality:** The Dome's bays run on **Trackman Booking & Payments (formerly YourGolfBooking)** — *not* foreUP, as earlier recon guessed. Trackman exposes **no public booking/availability API**. So we ship with a **pluggable availability module** backed by an **internal events calendar + manual staff hold in Trackman** as the launch default, and treat any deeper sync as a later enhancement contingent on Trackman partner access.

---

## 1. How the research was done

Five parallel research streams, each grounded in primary vendor pages, help docs, and
third-party reviews (G2/Capterra) where vendor data was gated:

- **A. Direct golf competitors:** Topgolf, Drive Shack, BigShots, Puttshack, Five Iron, X-Golf, Flying Tee, Topgolf Swing Suite.
- **B. Adjacent entertainment:** Bowlero/Lucky Strike, Dave & Buster's, Main Event, Round1, Urban Air, Sky Zone, iFLY, K1 Speed/Andretti, Bad Axe, escape rooms, Chuck E. Cheese, Puttery, breweries/restaurants.
- **C. Booking software:** ROLLER, CenterEdge, Tripleseat, Perfect Venue, Event Temple, SevenRooms, Tock, Resy, PartySlate, Peek Pro, FareHarbor, Xola, Square Appointments, HoneyBook, Yapsody, Skedda, Cal.com.
- **D. Availability platform:** Trackman Booking & Payments / YourGolfBooking (corrected from the foreUP lead).
- **E. (superseded) foreUP** — investigated, then deprioritized once Alex confirmed Trackman.

---

## 2. Best-of patterns to emulate (ranked, with why & who sets the bar)

1. **On-site overlay checkout, never a redirect.** The guest completes the whole booking in a
   panel/modal on *our* site. **Bar: ROLLER "Progressive Checkout" + FareHarbor "Lightframe."**
   Bouncing customers to a third-party domain measurably kills conversion.

2. **Headcount-routed instant-book lane.** A clean threshold (~ up to 20–25 guests) below which
   customers book instantly online, above which they hit a smart lead form. **Bar: Bowlero
   (≤25 instant), Puttshack (sub-segments 13–18 can still self-book), Topgolf, Five Iron.**
   Don't force a sales call on a 12-person birthday — that's the single biggest lost-revenue trap.

3. **Headcount-aware tiered package builder with anchoring.** Good/Better/Best, middle flagged
   "Most Popular," **inclusions that auto-scale with the guest count** entered at checkout, with
   turnover/cleaning buffers baked into the schedule. **Bar: ROLLER + CenterEdge.** Name the tiers
   for the *vibe*, not "Package A/B/C" — **Main Event's persona-named tiers** ("The Closer," "The
   Office Outing," "The Bash") do the upselling for you.

4. **"Minimum = credit you spend on yourselves," not a fee.** Bundle the F&B minimum into the
   quoted price and return unspent value as on-site credit. **Bar: Topgolf** (Drive Shack's "$200
   voucher" is the weaker version). This dissolves the #1 objection to group spend minimums.

5. **One-tap add-on upsells at the perfect moment** (after package is chosen, before payment),
   beverages first. Priced, menu-style, build-your-own. **Bar: Puttshack** (Prosecco/cocktail
   receptions, drink tokens inline), **ROLLER** (cake/food/décor add-ons), **Peek/FareHarbor**
   (+9% / +26% AOV claims from add-ons & bundles). Memory products (photos/video) sold **after**
   the experience at the emotional peak — **iFLY** nails this.

6. **Deposit-to-lock + stored card for the day-of balance.** Deposit-or-full toggle, expiring
   holds that auto-release if unpaid, card-on-file to auto-charge the balance, clear refund policy
   stated up front. **Bar: ROLLER; Tock for prepaid/deposit-on-the-book.** Keep the deposit **low,
   bill-applied, and low-risk-feeling** — **Chuck E. Cheese** ($50 applied to the bill,
   rebookable for a year) and **Bad Axe** (deposit covers just 2 admissions, the rest pay onsite)
   reduce commitment fear and *increase* final spend.

7. **Inquiry → branded proposal/BEO → e-signature → one-click deposit.** For larger/custom
   events: a fast lead form, instant auto-response (speed-to-lead is the #1 conversion driver),
   then a live, branded proposal with dynamic pricing + menu, a legally-binding e-signature, and a
   pay-the-deposit portal that converts the lead into a confirmed booking. **Bar: Tripleseat;
   match Perfect Venue's simplicity.**

8. **Funnel analytics + abandoned-cart recovery + first-party conversion pixels.** Capture email
   at step 1; fire "finish your booking" recovery emails; track views → step drop-off → conversion
   → AOV → upsell take-rate in real time. **Bar: Xola** (abandoned-reservation recovery + GA4/Ads
   tagging baked in) — and we **beat ROLLER's ~90-minute stale analytics** with real-time data.

**Honorable mentions worth stealing:**
- **Headcount flex as a feature** — "add guests until event day; reduce up to 48 hrs for credit" (**Bowlero**) removes commitment fear.
- **Tangible inclusions every guest keeps** — branded swag/return-pass (**Sky Zone SkySocks**): cheap, high perceived value, social-shareable.
- **"Book the slot now, decide F&B onsite"** (**Puttery**) — an option for the indecisive that still locks the date.
- **Free-for-the-guest-of-honor above a group size** (**Bad Axe** 7+) — drives bigger headcounts.
- **Own-your-UI economics** — **Cal.com** (open-source, embeddable, zero per-booking fee) is the cost model we mirror.

---

## 3. Anti-patterns to avoid

- **Form-walling small groups.** Drive Shack (7+), D&B (20+), K1, Swing Suite (6/8+) force a sales
  conversation for bookings Topgolf/Puttshack/Bowlero happily self-serve. Lost impulse revenue.
- **Hidden or absent pricing.** Five Iron, BigShots, Swing Suite, Flying Tee publish little/no
  pricing — every quote becomes a phone call. Even a "from $X / person" anchor beats silence.
- **Guest-visible booking surcharges.** FareHarbor/Peek's 6–8% checkout fee is a conversion-killer
  and a permanent tax. Owning the stack eliminates it.
- **Marking up payment processing** over raw Stripe cost (Perfect Venue 2.8–3.8%, ROLLER via Adyen).
- **Opaque, sales-gated pricing + arrears "usage fees"** (ROLLER) — erodes trust.
- **Late fee/deposit surprises.** Burying 18% service + 5% admin + tax until signature (Topgolf/D&B)
  breeds sticker shock. Show all-in pricing (taxes + gratuity) early.
- **Channel gaps** — Bowlero's laser tag "call us" breaks an otherwise self-serve flow. Every add-on
  we offer must be bookable in the same flow.
- **Generic "Package A/B/C" naming** — wastes the upsell moment.
- **Stale analytics & non-mobile back-office** (ROLLER). Real-time funnel + mobile-friendly admin.
- **No in-flow waiver** — handling waivers at the door is a day-of bottleneck; move e-sign into booking/confirmation.

---

## 4. Recommended flow — Smart Routing (entry point)

A single fun, on-brand landing step that adapts:

```
"Let's plan your event at the Dome 🏌️"
 → What are you celebrating?  [Birthday] [Group hangout] [Corporate / team] [League] [Bachelor(ette)] [Other]
 → Roughly how many guests?   [1–8] [9–16] [17–24] [25–40] [40+]
 → Preferred date (optional at this step)
```

**Routing logic (customer can always override):**
- Standard event type **AND** headcount ≤ ~24 → **Instant Book** ("Great — you can book this online right now").
- Corporate / buyout / league / headcount 25+ / "Other / highly custom" → **Inquiry** ("This one's worth a quick custom quote — we'll get back fast").
- A persistent **"Talk to a human"** escape hatch on every screen (chat/call/inquiry).
- **Email captured here** (soft, single field) to power abandoned-cart recovery from step 1.

---

## 5. Recommended flow — Instant Book (mobile-first, guest checkout)

Target: **as few steps as possible, clear progress bar, no forced account.**

| Step | Screen | Revenue / friction notes |
|---|---|---|
| 1 | **Date & time** — live availability calendar; peak slots badged | Off-peak nudges ("Save 15% Tue–Thu midday"); social proof ("Only 2 bays left Sat 7pm") |
| 2 | **Party size** — confirm headcount | Drives package recommendation + per-person math |
| 3 | **Package tier** — Good/Better/Best, middle "Most Popular," vibe-named | Anchoring; headcount nudge: "at 12 guests, Gold is only $4/person more"; inclusions auto-scale |
| 4 | **F&B selection** — per-person or platters; dietary notes; "minimum = credit you'll spend" framing | Optionally "decide F&B onsite" for the indecisive (Puttery move) — still locks the date |
| 5 | **Add-ons / upsells** — one-tap: +30 min bay, premium bar, wings, cake, décor, photographer, swag | The money moment — priced, frictionless, beverages first |
| 6 | **Guest info + e-waiver** — name/email/phone + e-sign; minor-supervision policy shown | Minimal typing, autofill; waiver out of the day-of door line |
| 7 | **Deposit or full payment** — Stripe overlay; deposit-or-full toggle; all-in pricing (tax + gratuity) shown; card stored for balance | Deposit locks revenue; stored card auto-charges day-of balance |
| 8 | **Instant confirmation** — calendar invite (.ics/Google), SMS+email, "invite your guests" shareable link, post-booking upsell/pre-order | More spend per head; reminders cut no-shows |

**Availability is locked at payment** (authoritative hold) so we never double-book.

---

## 6. Recommended flow — Inquiry / Request a Quote

Speed-to-lead is everything; the form is short and smart.

1. **Smart lead form** — date (+ "I'm flexible"), headcount range, event type, budget band,
   must-haves (checkboxes), contact. ~6 fields, mobile-first.
2. **Instant auto-response** (email + SMS) — sets expectations ("a real human replies within
   [SLA]"), links a self-serve **"or book a standard package now"** path in case they'd rather not wait.
3. **Staff review in admin** — lead lands in dashboard with source attribution; staff builds a
   **branded proposal** (dynamic pricing + menu + add-ons).
4. **Proposal → e-signature → one-click deposit link** — client signs and pays the deposit;
   the lead **auto-converts to a confirmed booking** on the same calendar as Instant Book.
5. **Nurture sequence** for non-responders (smart follow-ups), staff response-time SLA tracked.

---

## 7. Revenue-feature shortlist — prioritized by impact / effort

**Legend:** Impact (revenue lift potential) and Effort are H/M/L. "Phase" maps to the brief's build phases.

### Tier 1 — build into the core flow from day one (high impact, low/med effort)
| Feature | Impact | Effort | Phase |
|---|---|---|---|
| Tiered packages + "Most Popular" anchoring (vibe-named) | **H** | L | 1 |
| One-tap add-on upsells (after package, before pay), beverages first | **H** | L | 1 |
| Deposit-to-lock + stored card for day-of balance | **H** | M | 1 |
| Per-person pricing with headcount nudges / "fits your group" recommendation | **H** | L | 1 |
| All-in transparent pricing (tax + gratuity shown early) | **H** | L | 1 |
| Email capture at step 1 (powers everything downstream) | **H** | L | 1 |
| "Minimum = credit you spend on yourselves" framing | **H** | L | 1 |

### Tier 2 — fast follows (high impact, med effort)
| Feature | Impact | Effort | Phase |
|---|---|---|---|
| Abandoned-booking recovery emails (capture → "finish booking") | **H** | M | 3 |
| Inquiry speed-to-lead auto-response + nurture sequence | **H** | M | 2 |
| Confirmation + reminders (email + SMS) + calendar invite | **H** | M | 1–2 |
| Post-booking upsell + "invite your guests" shareable link | **M-H** | M | 2–3 |
| Funnel analytics dashboard (views → drop-off → conversion → AOV → take-rate) | **H** | M | 3 |
| Social proof + gentle urgency ("2 bays left", "37 parties booked this month") | **M-H** | L | 3 |

### Tier 3 — high-value revenue layer (high impact, higher effort)
| Feature | Impact | Effort | Phase |
|---|---|---|---|
| Gift cards & giftable party packages (cash up front) | **H** | M-H | 3 |
| Dynamic / peak vs off-peak pricing (fills weekday troughs) | **H** | M-H | 3 |
| Group-size upsell incentives / bundle unlocks | **M** | M | 3 |
| Re-book & referral credit; corporate/league recurring revenue | **M-H** | M-H | 4 |

### Tier 4 — delight & retention (lower/medium impact, opportunistic)
| Feature | Impact | Effort | Phase |
|---|---|---|---|
| Tangible swag inclusions (branded, every guest keeps) | **M** | L (ops) | 3–4 |
| Headcount flex as a feature ("add until event day") | **M** | M | 3–4 |
| Post-experience photo/video upsell | **M** | M-H | 4 |

---

## 8. Availability & integration recommendation

**Confirmed:** The Dome's bays run on **Trackman Booking & Payments** (the rebranded
**YourGolfBooking** — Trackman acquired YOURGOLFBOOKING.COM LTD, directors appointed Mar 2023;
product relaunched June 2025). Customer pages still serve from `yourgolfbooking.com/venues/{slug}/booking`;
operator login `booking.trackmangolf.com` is branded "YGB."

**Key finding:** Trackman Booking & Payments exposes **no public/partner API, webhooks, or
documented iCal/Google Calendar export** for reading bay availability or creating reservations.
(Trackman's *developer* APIs are for simulator/range shot & game data, not the reservation system.)
Its integrations are operational connectors only — Stripe/Square (payments) and Dormakaba (door/PIN
access). It has a lightweight native **Events** module (ticketed/tournament-style: title, dates,
capacity, ticket limits, invite-only) that is **insufficient for full private parties** (no
deposit+balance lifecycle, F&B packages, waivers, multi-bay holds, or intake forms) — which is
exactly why a custom engine is justified.

**Recommended architecture — pluggable `AvailabilityProvider` with these implementations:**

1. **Internal events calendar (launch default).** Our own DB of bays/rooms with buffered holds,
   deposit-locked confirmation, and party-specific logic. Single source of truth for *events*;
   Trackman remains source of truth for *open-play bays*. Staff place a corresponding manual
   hold/block in Trackman for the bays an event consumes (with turnover buffers).
2. **Google Calendar adapter (optional advisory layer).** If staff can mirror Trackman blocks into
   a Google Calendar, we read it via the Google Calendar API as an advisory availability signal.
3. **Trackman sync adapter (future, contingent).** Only if Alex secures explicit Trackman
   partner/API access — treat as out of scope for v1.

This keeps us **shippable immediately** and makes deeper sync an opt-in enhancement, never a blocker.

---

## 9. Proposed architecture (per brief §7, refined)

- **Frontend:** Next.js + React + Tailwind. Hosted booking page **plus** an embeddable widget
  (overlay/modal, ROLLER/FareHarbor-style) the marketing site drops in via a script snippet.
  Mobile-first.
- **Backend/DB:** Supabase (Postgres) — events, packages, add-ons, availability, bookings, leads,
  payments, analytics.
- **Payments:** **Stripe** (Checkout / Payment Elements) — deposits, balances, full pay, refunds,
  gift cards. **Stripe-hosted card entry only (PCI).** Raw Stripe pricing, no surcharge.
- **Comms:** Resend/Postmark (email: confirmations + nurture + recovery); Twilio (SMS reminders).
- **Availability:** pluggable module (internal calendar default; Google Calendar optional;
  Trackman future).
- **Admin:** role-gated dashboard in the same app.
- **⚠️ Workspace boundary:** **fresh, Dome-dedicated infrastructure** — new repo (this one), new
  Vercel + Supabase, and a **Stripe account dedicated to the Dome.** No entanglement with the
  Whitetail CMA system or the real-estate business. **Confirm Stripe account ownership before
  wiring payments.**

---

## 10. Open questions for Alex (please confirm before / during Phase 1)

**Availability / operations**
1. Confirm the bay system is **Trackman Booking & Payments / YourGolfBooking** (login `booking.trackmangolf.com`)?
2. Has Trackman ever offered API access, webhooks, or a data feed — and will they on request?
3. Can Trackman export bay availability/bookings as **iCal or to Google Calendar**?
4. Are **party/event spaces separate** from open-play bays, or do events consume the same physical bays?
5. OK with staff placing **manual holds in Trackman** when our engine books an event (launch workflow)?
6. **Capacity:** # of bays/rooms, max party size, hours of operation, lead-time rules, turnover/cleaning buffers?

**Payments / business**
7. **Stripe** — new or existing account? Who owns it? (Keep Dome-dedicated.)
8. **Packages & pricing** — party tiers, F&B packages, add-ons, per-person rates, deposit %,
   cancellation/refund policy, tax & gratuity handling.
9. **Waiver / liability** — e-sign required at booking? Provide current waiver text.

**Brand / channels**
10. **Website platform** for embedding (WordPress / Squarespace / custom)?
11. **Brand kit** — logo, colors, fonts, photography, voice/tone.
12. **Inquiry workflow** — who handles quotes, response-time SLA, approval rules.
13. **Integrations wanted** — POS, CRM/email marketing, accounting, Google Calendar.

---

## 11. Proposed next step

On approval of the flows + revenue shortlist above, proceed to **Phase 1 — Core Instant Book**
for one event type (birthday parties): date → package → F&B → add-ons → deposit → confirmation on
the internal managed calendar, with a real end-to-end test booking capturing a deposit in **Stripe
test mode** + a confirmation email.

**To unblock Phase 1 I most need from Alex:** answers to Q6–Q9 (capacity, Stripe ownership,
package/pricing, deposit %, waiver), plus the brand kit (Q11) for the UI.

*Awaiting your sign-off — or edits to the flow/shortlist — before any code is written.*
