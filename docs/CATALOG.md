# Catalog & pricing reference (from the venue's party cards)

This documents the real packages/pricing loaded by `prisma/seed.ts`, and the
large-group rate card staff use when quoting inquiries. **Everything here is
editable in the admin (Packages / Food & drink / Add-ons / Settings) — no code.**

## Venue policies (Settings)

- **6 guests per bay**, 30-min turnover buffer, 7-day online lead time.
- **20% service charge on food & beverage only** (not on bay rental).
- **Taxes are included in listed prices** → `taxPct = 0`.
- **Fri–Sun = peak**, Mon–Thu = standard. Weekend premium modeled as a
  `peakSurchargePct` (22%) on the bay package.
- 10% deposit to book.
- ⚠️ The card mentions a **3.5% credit-card convenience fee** — not yet applied
  in the engine (a payment-surcharge decision). Flagged for Alex.

## Pricing engine — per bay, per hour (BayRate)

Bay time is priced as **bays × hours × rate**, where the rate comes from the **BayRate**
table (admin → Bay rates). The most specific matching row wins (highest "bays ≥" tier),
so the per-bay-hour rate **steps down for larger groups** and is **higher on weekends** —
exactly how the cards were built. The customer never picks a tier: they choose size, date,
and time, and the price is computed automatically.

Seeded rate table (editable in admin):

| Days | Applies when bays ≥ | $/bay/hour |
|---|---|---|
| Mon–Thu | 1 | $45.00 |
| Mon–Thu | 4 | $41.25 |
| Fri–Sun | 1 | $55.00 |
| Fri–Sun | 4 | $50.00 |

Add rows for finer time-of-day tiers (e.g. the large-group morning/evening rates) anytime.

### Large-group rate set (`tag = group`, loaded)

The brochure's per-bay/per-hour rates are loaded as a separate `group` rate set (14 rows:
day + time-of-day window + duration tier). They power group pricing without colliding with
the birthday set. Verified against the brochure (per bay): Mon AM 2h $70 / 4h $120; Mon PM
2h $100; Sat 3h $165; Fri PM 4h $220; Sun AM 4h $190. (One rounding note: the Mon–Thu PM
**3-hour** total lands ~$0.04 off because $140 ÷ 3 isn't a clean per-hour rate.) A 4-bay
minimum applies to groups — enforce when a group self-serve package is added; today groups
flow through inquiry → quote, so staff can also read these straight off the rate table.

## Card convenience fee

`Setting.cardFeePct` (default **0 = off**). When set, it's applied transparently to the
amount charged online. Recommendation: keep off (Visa caps credit surcharges at 3%, debit
can't be surcharged, requires registration/signage) or enable a compliant ≤3% credit-only
fee — otherwise absorb it / bake into prices.

## Birthday parties — Instant Book (per-bay-hour presets + food bundles)

Packages are thin presets over the rate engine (bays + duration); price is computed.

| Package | Bays | Hours |
|---|---|---|
| Up to 10 Guests | 2 | 2 |
| Up to 20 Guests | 4 | 2 |

Food bundles (per person, **no extra service charge** — matches the rack card):
- Chicken Tenders Meal — **$7/guest** (incl. juice box & chips)
- Burger Sliders Meal — **$12/guest** (incl. juice box & chips)

**Card totals reproduced exactly** (verified): Mon–Thu 10p = 180 / 250 / 300, 20p = 330 /
470 / 570; Fri–Sun 10p = 220 / 290 / 340, 20p = 400 / 540 / 640.

## Themed buffets (per person — 20% service charge applies)

- Early Birdie — $20 · Bunch of Bites — $22 · All American — $24 · Fiesta — $26

## Add-ons / upsells

**Beverage packages** (per person, 2 hrs of service, 20% SC): Unlimited Soft Drinks $4 ·
Beer & Wine Bar $16 · Standard Bar $20 · Premium Brand Bar $27.

**Party platters** (flat, 20% SC): Hand-Breaded Wings (30) $40 · Cheese Curds $40 ·
Cheeseburger Sliders (15) $38 · Tater Smash $28 · Loaded Fries $26 · The Sandtrap $24 ·
Signature Nachos $24 · Bottomless Chips/Salsa/Queso $24.

**Build-your-own platter** (flat, 20% SC): 2 apps $25 · 4 apps $50 · 6 apps $75 · 8 apps $100.

**Time & extras**: +30 min bay time $40 · Celebration Décor $75.

## Large-group rates — Inquiry/quote flow (per bay, 4-bay minimum, up to 6/bay/hr)

These per-bay/per-hour rates don't map to a single Instant Book package; staff use
them in the **inquiry → quote** flow (enter the computed total on the lead). Captured
here so the numbers aren't lost.

| Day & time | 2 hrs | 3 hrs | 4 hrs |
|---|---|---|---|
| Mon–Thurs (open–12pm) | $70 | $100 | $120 |
| Mon–Thurs (12pm–close) | $100 | $140 | $160 |
| Friday (open–2pm) | $100 | $150 | $190 |
| Sunday (open–12pm) | $110 | $150 | $190 |
| Friday (2pm–close) | $110 | $165 | $220 |
| Saturday (all day) | $110 | $165 | $220 |
| Sunday (12pm–close) | $110 | $165 | $220 |

*Future option:* add a per-bay-per-hour package type so large groups can self-serve
too. The catalog/pricing seams support adding new pricing models without rework.

## Other menu notes (from the cards, for future use)

- Wing sauces/rubs: BBQ, Buffalo, Caribbean Jerk, Gochujang, Nashville Hot, House Rub, Lemon Pepper.
- Loaded Fries / Signature Nachos: +$10 grilled chicken, +$8 ground beef (add as add-on modifiers later).
- Group bays include: complimentary clubs, Trackman range tech, TV entertainment, unlimited balls, virtual courses & games, food & drink service.
- Group party includes: 2–4 hr reservation, party host, game demonstration, personal server, private bays.
