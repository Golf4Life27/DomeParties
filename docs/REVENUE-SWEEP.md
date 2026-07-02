# Revenue sweep — findings & status

A full audit of the build against the revenue goals (2026-06). Four code-level leaks were
found and **fixed + verified**; the remaining items are prioritized product gaps.

## Fixed leaks ✅

1. **Expiring holds.** Unpaid checkout holds used to lock bays forever. Now: holds expire
   after `Setting.holdMinutes` (default 30, editable in admin). Expired holds stop blocking
   availability instantly; the hourly cron reverts them to DRAFT (freeing resources and
   making them abandoned-cart-recovery eligible). If a payment lands *after* expiry, the
   engine re-assigns bays before confirming — and if they're gone, it keeps the deposit and
   routes to staff review instead of double-booking. Quote bookings (staff-sent) have no
   expiry. *Verified: block → expire → free → cron revert → late-pay revalidation.*
2. **"+30 Minutes of Bay Time" now extends the reserved window** (per quantity), is
   conflict-checked, and can't run past closing (friendly error). *Verified: 120→180 min
   hold; 9pm+3hr rejected.*
3. **Staff notifications.** `Setting.staffNotifyEmail` (admin-editable). Staff now get:
   🔴 new lead (speed-to-lead), 🔴 deposit-paid booking needing review, and ✅ every new
   confirmed booking — each with an admin deep link. *Verified: all three fire.*
4. **Gift card Stripe return.** `/gift?paid=1` now shows a success panel (code arrives by
   email) instead of an empty form. *Verified via browser.*

## Remaining gaps (prioritized by expected revenue impact)

**Tier 1 — "after the deposit" money:**
1. Pre-event reminder emails/SMS (T-7 / T-1) — no-show killer + natural upsell slot.
2. Balance-due collection — saved card (`setup_future_usage`) or pay-balance link;
   most of each event's revenue currently has no online collection path.
3. Post-booking upsell + "invite your guests" page — confirmation dead-ends today.

**Tier 2 — conversion & marketing plumbing:**
4. Promo codes (fill Mon–Thu troughs; gift cards ≠ discounts).
5. Lead nurture follow-up (24–48h) + staff response SLA tracking.
6. Recovery sequence: 2nd/3rd touch (benchmark: Xola's 3), optional incentive.
7. Third birthday tier ("Ultimate") for price anchoring — 2 tiers anchor weakly.
8. GA4/Meta conversion pixels for paid traffic.

**Tier 3 — retention (post-launch):**
9. Headcount flex (add guests until event day — every guest adds F&B).
10. Re-book + referral credit emails after the event.
11. Step-level funnel analytics (which wizard step bleeds).

## Strengths confirmed by the sweep

Exact-to-the-card pricing via the rate engine; both booking paths + quotes; deposit-first
with transparent all-in pricing; gift cards; recovery capture; conflict-safe inventory;
no per-booking platform tax (the FareHarbor/Peek 6–8% you avoid by owning this).
