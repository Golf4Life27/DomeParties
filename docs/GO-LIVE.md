# Go-Live Checklist — Whitetail Ridge Golf Dome Booking Engine

A step-by-step to take this from the repo to a live, revenue-taking site. Work top to
bottom; the whole thing is ~1–2 hours plus DNS/verification waits. **Do the test-mode dry
run (§7) before flipping Stripe live (§8).**

---

## 0. Accounts you'll need (all Dome-dedicated — keep separate from the CMA/real-estate)

- [ ] **Vercel** — hosting (free/Pro fine)
- [ ] **Supabase** — Postgres database (free tier fine to start)
- [ ] **Stripe** — the Dome's own account (deposits/payments)
- [ ] **Resend** — transactional email (confirmations, recovery, quotes)
- [ ] *(optional later)* **Twilio** — SMS reminders (not required for launch)

---

## 1. Database (Supabase)

1. [ ] Create a new Supabase project. Save the DB password.
2. [ ] Get two connection strings (Project → Settings → Database):
   - **Pooled** (Transaction, port `6543`) → used by the app at runtime.
   - **Direct** (Session, port `5432`) → used to run migrations.
3. [ ] Apply the schema and seed **once** (from your machine, pointing at the **direct** URL):
   ```bash
   DATABASE_URL="postgresql://…:5432/postgres" pnpm db:deploy   # prisma migrate deploy
   DATABASE_URL="postgresql://…:5432/postgres" pnpm db:seed     # real catalog + rates
   ```
   This loads the real packages, F&B, add-ons, and bay-rate tables from the party cards.

> Prisma 7 uses a driver adapter, so no engine downloads are needed on Vercel.
> `postinstall` runs `prisma generate` automatically during the Vercel build.

---

## 2. Environment variables (set in Vercel → Project → Settings → Environment Variables)

| Var | Value |
|---|---|
| `DATABASE_URL` | Supabase **pooled** URL (port 6543) |
| `NEXT_PUBLIC_APP_URL` | your production URL, e.g. `https://book.whitetailridgegolfdome.com` |
| `STRIPE_SECRET_KEY` | Stripe secret (start with **test** `sk_test_…`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable (`pk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | from the webhook you create in §3 (`whsec_…`) |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | `Whitetail Ridge Golf Dome <events@yourdomain.com>` (must be a verified domain) |
| `ADMIN_PASSWORD` | a strong staff password |
| `ADMIN_SESSION_TOKEN` | a long random string (e.g. `openssl rand -hex 32`) |
| `CRON_SECRET` | a long random string (Vercel auto-sends it to the cron) |

> Leave `STRIPE_*` / `RESEND_API_KEY` blank and the app safely falls back to dev mode
> (simulated deposit + emails logged) — handy for a first smoke test.

---

## 3. Stripe

1. [ ] In Stripe (test mode), create a webhook: **Developers → Webhooks → Add endpoint**
   - URL: `https://<your-domain>/api/webhooks/stripe`
   - Event: **`payment_intent.succeeded`**
   - Copy the **Signing secret** → set `STRIPE_WEBHOOK_SECRET` in Vercel.
2. [ ] Confirm `STRIPE_SECRET_KEY` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are the **test** keys for now.
3. [ ] (Deposits are 10% by default — adjust in **admin → Settings**.)

---

## 4. Email (Resend)

1. [ ] Add + **verify your sending domain** in Resend (DNS records).
2. [ ] Set `RESEND_API_KEY` and `EMAIL_FROM` (using the verified domain).
3. [ ] Send a test booking (later, §7) and confirm the email + `.ics` invite arrive.

---

## 5. Deploy (Vercel)

1. [ ] Import the GitHub repo into Vercel (branch: your main/production branch).
2. [ ] Framework preset: **Next.js** (build command `next build`, install `pnpm install`).
3. [ ] Ensure all env vars from §2 are set for **Production**.
4. [ ] Deploy. The `vercel.json` cron will register automatically (hourly abandoned-cart
   recovery hitting `/api/cron/recovery`).
5. [ ] Point your domain/subdomain (e.g. `book.whitetailridgegolfdome.com`) at Vercel and set
   `NEXT_PUBLIC_APP_URL` to match.

---

## 6. Configure the venue (admin → `https://<domain>/admin`)

Log in with `ADMIN_PASSWORD`. Everything here is no-code.

- [ ] **Bays** — decide inventory. Mark bays **Exclusive** (only this engine books them →
  instant confirmation) vs leave **Shared** (also in Trackman → deposit captured, held for
  your quick review). *Nothing double-books either way.* Dedicate a block to enable instant.
- [ ] **Settings** — confirm hours, deposit %, service charge % (F&B), tax (currently 0 =
  tax-inclusive), peak/off-peak, cancellation windows, and card fee (0 = off; see note).
- [ ] **Packages / Bay rates / Food & drink / Add-ons** — verify the seeded numbers match
  your current cards; tweak names/prices as needed.
- [ ] **Waiver** — paste your real waiver text (replace the placeholder) — *send it to me or
  edit in code `src/app/book/page.tsx` step 5; a DB-backed waiver field can be added if you
  want it fully admin-editable.*
- [ ] **Brand** — logo/colors/photography (send me the kit and I'll theme it) — optional for
  a soft launch.

---

## 7. Test-mode dry run (before real money)

- [ ] Book a **birthday** end-to-end with a Stripe **test card** (`4242 4242 4242 4242`),
  confirm deposit captured + confirmation email + calendar invite.
- [ ] Book a **group** (Group hangout) — verify bays scale and pricing matches the card.
- [ ] If any bay is **Shared**, confirm the booking lands in **admin → Bookings → Needs
  review**, then **Confirm** it and check the guest gets the final email.
- [ ] Submit an **inquiry**, send a **quote** from admin, pay its deposit link.
- [ ] Buy and **redeem a gift card**.
- [ ] Confirm the **overview** dashboard reflects it all (revenue, funnel, upsell take-rate).

---

## 8. Go live (real payments)

- [ ] Swap Stripe to **live** keys (`sk_live_…`, `pk_live_…`) in Vercel.
- [ ] Recreate the Stripe webhook in **live** mode → update `STRIPE_WEBHOOK_SECRET`.
- [ ] Redeploy.
- [ ] Do one **small real booking** yourself and refund it in Stripe to confirm the live path.

---

## 9. Embed on the website (WordPress)

From **admin → Embed**, copy the snippet:
```html
<div id="whitetail-dome-booking"></div>
<script src="https://<your-domain>/embed.js" async></script>
```
- [ ] Paste it into the page where booking should appear (Custom HTML block). It auto-resizes.
- [ ] For marketing buttons, link straight to `/book`, `/inquire`, or `/gift`.

---

## 10. Post-launch

- [ ] Watch **admin → Bookings** (especially "Needs review" if you kept bays Shared).
- [ ] Recovery emails fire hourly via cron — confirm one lands after an abandoned cart.
- [ ] Revisit the **card convenience fee** decision: it's OFF. If you enable it, keep it ≤3%
  and credit-only for card-network compliance (see `docs/CATALOG.md`).
- [ ] Later, if you can spare bays: dedicate more as Exclusive to grow instant-book capacity.

---

## Open items I still need from you

1. **Waiver text** (real copy).
2. **Brand kit** (logo, colors, fonts, a few hero photos).
3. **Bay allocation** — which/how many bays can be Exclusive (dedicated to this engine).
4. **Exact tax handling** — confirm prices are tax-inclusive (tax = 0) or give me the rate.
5. **Card fee** — final on/off (and %, if on).

Once I have #1–#4 I can finish the theming and set sensible Exclusive defaults so instant
book works out of the box.
