-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "stripeBalanceIntentId" TEXT;

-- No backfill is possible: the balance intent id was never recorded anywhere, so
-- for bookings whose balance was already paid it exists only in Stripe. Those
-- rows keep a NULL and the refund path reports the amount as owed by hand, which
-- is what it already did for every booking before this column existed.

-- Refunds and disputes arrive as webhooks carrying only a payment intent id, so
-- both id columns are looked up by value on a hot path. Index them.
CREATE INDEX IF NOT EXISTS "Booking_stripeBalanceIntentId_idx" ON "Booking"("stripeBalanceIntentId");
CREATE INDEX IF NOT EXISTS "Booking_stripePaymentIntentId_idx" ON "Booking"("stripePaymentIntentId");
