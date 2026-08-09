-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "balancePaidAmount" INTEGER NOT NULL DEFAULT 0;

-- Backfill: existing settled bookings carry their full balance in balanceDue.
-- Move it to the new column and zero the outstanding amount, so the meaning of
-- balanceDue ("what is still owed") is consistent for old rows too. Without this
-- an upsell on an already-paid historic booking would still re-bill the balance.
UPDATE "Booking"
SET "balancePaidAmount" = "balanceDue",
    "balanceDue" = 0
WHERE "balancePaid" = true;
