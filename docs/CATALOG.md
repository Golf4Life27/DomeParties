# Catalog & pricing reference (from the venue's party cards)

This documents the real packages/pricing loaded by `prisma/seed.ts`, and the
large-group rate card staff use when quoting inquiries. **Everything here is
editable in the admin (Packages / Food & drink / Add-ons / Settings) — no code.**

## Venue policies (Settings)

- **6 guests per bay**, 30-min turnover buffer, 7-day online lead time.
- **20% service charge on food & beverage AND golf/bay charges** (July 2026 trifold:
  "an automatic 20% service charge will be applied to food & beverage and golf
  charges") → `serviceChargeOnGolf = true` (toggle in Settings).
- **3.5% credit-card convenience fee** (printed on the trifold) → `cardFeePct = 3.5`,
  applied to online card charges (deposit & balance). Toggle in Settings.
- **Taxes are included in listed prices** → `taxPct = 0`.
- **Fri–Sun = peak**, Mon–Thu = standard. Weekend premium modeled as a
  `peakSurchargePct` (22%) on the bay package.
- 10% deposit to book.

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

The trifold's per-bay **block prices** are loaded as a separate `group` rate set (21 rows:
7 day/time bands × 3 duration tiers). Each row carries `flatPerBay` — the exact printed
per-bay price for that 2/3/4-hour block — so totals match the brochure to the penny
(no more $399.96 rounding artifacts; a 3-hour Mon–Thu AM group is exactly 4 × $100 = $400).
`ratePerHour` remains as the reference/fallback rate. A 4-bay minimum applies (packages
enforce it via `dynamicBays` min).

## Card convenience fee

`Setting.cardFeePct` = **3.5** (per the printed trifold: "3.5% convenience fee added on
for all credit card transactions"). Applied transparently to online card charges (deposit
and balance payments; gift-card purchases are currently exempt). Compliance note kept for
reference: Visa caps credit surcharges at 3% and debit can't be surcharged — if that ever
becomes an issue, drop to 3.0 or 0 in Settings with one edit.

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

- **Pizza Party — $30** (pizzas, bread sticks, cheese curds, Caesar/pasta salad, cookies & brownies)
- Bunch of Bites — $24 · All American — $26 · Fiesta — $26
- Early Birdie ($20) retired from the current trifold — seeded **inactive** (restore in admin).

## Add-ons / upsells

**Beverage packages** (per person, 2 hrs of service, 20% SC): Unlimited Soft Drinks $4 ·
Beer & Wine Bar $16 · Standard Bar $20 · Premium Brand Bar $27.

**Party platters** (flat, 20% SC): Hand-Breaded Wings (30) $40 · Cheese Curds $40 ·
Cheeseburger Sliders (15) $38 · **BBQ Chicken Sliders (15) $28** · Loaded Fries $26 ·
The Sandtrap $24 · Signature Nachos $24 · Bottomless Chips/Salsa/Queso $24 ·
**Add Grilled Chicken $10 / Add Ground Beef $8** (Fries/Nachos top-ups).
Tater Smash ($28) retired from the current trifold — seeded **inactive**.

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

### Group self-serve (live)

Large groups can now book online too: three **GROUP** packages (`Large Group — 2/3/4 Hours`)
use the `group` rate set with **dynamic bays** — bays scale with the party (`ceil(guests/6)`,
4-bay minimum), priced automatically by day/time/duration. The wizard routes "Group hangout"
here; corporate/league/other still go to inquiry → quote. Verified: Sat PM 3hr/24 guests =
$660 (4×$165); Mon AM 3hr/30 = ~$500 (5 bays); 12 guests still bills the 4-bay minimum.
Conflict-safety applies (shared bays → staff review), same as birthdays. Deactivate these
packages in admin if you'd rather keep groups on the inquiry flow.

## Other menu notes (from the cards, for future use)

- Wing sauces/rubs (July 2026 trifold): BBQ, Buffalo, Caribbean Jerk, Nashville Hot Rub, House Rub, Lemon Pepper.
- Loaded Fries / Signature Nachos protein top-ups are live add-ons (+$10 chicken, +$8 beef).
- Group bays include: complimentary clubs, Trackman range tech, TV entertainment, unlimited balls, virtual courses & games, food & drink service.
- Group party includes: 2–4 hr reservation, party host, game demonstration, personal server, private bays.
