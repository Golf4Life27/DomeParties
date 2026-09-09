-- Venue policy is tax-INCLUSIVE pricing: listed prices already contain sales
-- tax. Production was running taxPct at 7.25%, adding it a second time on top
-- of prices that already had it — $55.10 on a $967 booking.
--
-- Applied as a migration rather than a seed: runSeed() deletes packages,
-- resources, bookingResource and bookingAddOn, so re-running it in production
-- would tear bay assignments and add-ons off live bookings.
UPDATE "Setting" SET "taxPct" = 0 WHERE "id" = 1;

-- And so a fresh database cannot reintroduce it.
ALTER TABLE "Setting" ALTER COLUMN "taxPct" SET DEFAULT 0;
