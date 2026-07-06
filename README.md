# Whitetail Ridge Golf Dome — Event Booking Engine

A clean, fun, mobile-first event-booking engine for **Whitetail Ridge Golf Dome**
(Oswego, IL). Customers pick a date, choose a package, add food & add-ons, sign a
waiver, and lock their event with a deposit — with an instant confirmation.

> **Research & flow design:** see [`docs/PHASE-0-RESEARCH.md`](docs/PHASE-0-RESEARCH.md).
> **What's built in Phase 1:** see [`docs/PHASE-1-NOTES.md`](docs/PHASE-1-NOTES.md).

## Stack

- **Next.js 16** (App Router) + React 19 + Tailwind CSS 4
- **Prisma 7** (pg driver adapter) → **PostgreSQL** (Supabase-compatible)
- **Stripe** for deposits (test mode; dev fallback when no keys)
- **Resend** for email (console fallback in dev) + `.ics` calendar invites

## Getting started

```bash
pnpm install                # also runs `prisma generate`

# 1. Point DATABASE_URL at a Postgres DB (see .env.example)
cp .env.example .env        # then edit values

# 2. Create schema + seed placeholder catalog (packages, F&B, add-ons, 30 bays)
pnpm db:migrate
pnpm db:seed

# 3. Run it
pnpm dev                    # http://localhost:3000
```

The booking flow lives at `/book`. With no Stripe keys set, checkout uses a
**dev "simulated deposit"** so the full flow (including the confirmation email,
logged to the server console) is testable. Add the Dome's Stripe **test** keys to
`.env` to enable real card entry via Stripe Payment Elements.

## Environment variables

See `.env.example`. Key ones:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (Supabase in prod) |
| `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe (test → live). Blank = dev fallback. |
| `STRIPE_WEBHOOK_SECRET` | Verify Stripe webhook at `/api/webhooks/stripe` |
| `RESEND_API_KEY` / `EMAIL_FROM` | Email. Blank = log to console. |

## Project layout

```
prisma/schema.prisma        data model (settings, resources, packages, bookings, leads)
prisma/seed.ts              placeholder catalog + venue config
src/lib/                    pricing, availability (pluggable), booking, email, stripe
src/app/book/               the Instant Book wizard (client) + confirmation page
src/app/api/                catalog, availability, quote, bookings, checkout, webhooks
```

## Scripts

| Script | Does |
|---|---|
| `pnpm dev` / `pnpm build` | run / build |
| `pnpm db:migrate` | create & apply a migration (dev) |
| `pnpm db:deploy` | apply migrations (prod/CI) |
| `pnpm db:seed` | seed catalog + config |
| `pnpm db:reset` | drop, re-migrate, re-seed |

## Configuration is data, not code

Hours, deposit %, service-charge %, tax %, buffers, lead time, packages, F&B, and
add-ons all live in the database (`Setting` + catalog tables) so they're tunable
without code changes. (An admin UI to edit these is Phase 2.)
