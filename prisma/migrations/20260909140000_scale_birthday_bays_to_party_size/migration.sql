-- The 11-20 guest birthday package sold a fixed 4-bay block. Twelve guests fit
-- in two bays (bayCapacity is 6) and were charged for four. Make `bays` a floor
-- and let the count scale with the party.
--
-- Applied as a migration rather than a seed on purpose: runSeed() deletes
-- packages, resources, bookingResource and bookingAddOn, so re-running it in
-- production would tear bay assignments and add-ons off live bookings.
UPDATE "Package"
   SET "bays" = 2,
       "dynamicBays" = true,
       "tier" = '2–4 Bays',
       "description" = 'The big bash for bigger friend groups and families — up to 20 guests, with bays matched to your headcount.'
 WHERE "name" = 'Birthday Party — Up to 20 Guests'
   AND "pricingType" = 'BAY_RATE';
