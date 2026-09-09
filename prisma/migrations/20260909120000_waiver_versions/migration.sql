-- Versioned terms, so a signature stays tied to the words that were on screen.
CREATE TABLE "WaiverVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaiverVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WaiverVersion_version_key" ON "WaiverVersion"("version");
CREATE INDEX "WaiverVersion_active_idx" ON "WaiverVersion"("active");

ALTER TABLE "Booking" ADD COLUMN "waiverVersionId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "waiverIp" TEXT;
ALTER TABLE "Booking" ADD COLUMN "waiverUserAgent" TEXT;

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_waiverVersionId_fkey"
  FOREIGN KEY ("waiverVersionId") REFERENCES "WaiverVersion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Publish version 2026-09-v1 and make it active, here rather than in the seed.
-- runSeed() deletes packages, resources, bookingResource and bookingAddOn, so
-- telling anyone to run it in production to publish terms would tear bay
-- assignments and add-ons off live bookings. A migration applies on deploy with
-- no such blast radius. seedWaiver() stays for fresh databases and is idempotent.
INSERT INTO "WaiverVersion" ("id", "version", "title", "body", "active")
VALUES ('wv_2026_09_v1', '2026-09-v1', 'Reservation terms & safety rules', 'RESERVATION POLICY
Online reservations take priority over walk-ins. Bay reservations start at the exact time of booking, regardless of whether your party is present or not. It is recommended to arrive 5 minutes prior to your booking to ensure you can start on time. Extensions of bays, rescheduling a booked time, and any last-minute changes to an existing reservation are subject to availability or the cancellation policy below.

CANCELLATION POLICY
If a reservation is prepaid and needs to be cancelled within 24 hours of your reservation, a credit will be placed on your account for future use at Whitetail Ridge Golf Dome. In that event, please call to make your next reservation so we can apply the credit. Reservations cancelled 24 hours or more prior may be refunded in full after 3–5 business days.

SAFETY & RESPONSIBILITY
Guests with reservations must adhere to Whitetail Ridge Golf Dome''s safety rules listed below. Whitetail Ridge Golf Dome reserves the right to remove from the venue any guest who violates the safety rules. If injury should result because safety rules are not followed or are ignored, Whitetail Ridge Golf Dome will not be liable.

Everyone''s safety is very important. By reserving a bay at Whitetail Ridge Golf Dome, all guests agree to abide by the following safety rules in addition to all verbal and posted instructions.

SAFETY RULES
1. All golfers must hit from the mat at all times. No running starts or horseplay.
2. Only the person hitting a ball should stand beyond the TV monitors. All other players should remain behind the TV monitors when a player is hitting. Players are responsible for the safety of others around them and should always check their surroundings before swinging a club.
3. Aim for the targets at all times. Aiming for the ball picker or intentionally hitting golf balls away from the range turf is strictly prohibited.
4. Guests must stay off the turf on the first level and behind the yellow line on the second level at all times. Please take extra care when playing from the upstairs bays.
5. Anyone under 16 must be supervised by a guest who is 21 or older at all times. Anyone under 18 must be supervised by a guest who is 21 or older after 9PM. If injury should result due to lack of supervision, Whitetail Ridge Golf Dome shall not be held liable.
6. Throwing golf balls is prohibited. Only dispense one golf ball at a time.
7. Whitetail Ridge Golf Dome is not responsible for lost or stolen items.
8. Using anything other than the rubber tees provided for hitting balls is prohibited.

SURVEILLANCE & DAMAGES
Whitetail Ridge Golf Dome is under 24-hour surveillance. When booking a bay, we ask that you follow all posted instructions inside the dome and on our website. Failure to do so may hold you liable for any damages or injuries caused in your bay or any surrounding bays.

BAY RULES
Only one person may swing at a time, and you may only hit one ball per shot (no pulling three balls and swinging rapid fire). If you aren''t swinging, we ask that you stay behind the monitor and within the confines of your reserved bay. There may be a lot of people in both your own and the surrounding bays, so this is for everyone''s safety. There are also many monitors, wires, TVs, safety netting and other equipment that are expensive, so we want to ensure everyone is vigilant about their surroundings.

2ND-LEVEL BAYS
All of the above rules apply. In addition, there is a yellow line running across all of the top-level bays before the safety netting. You may not step over that line for any reason. If something valuable falls into the safety nets, you must ask a staff member to help you retrieve it. Safety netting is in place for life-saving purposes and is only rated for one fall. If anyone falls into the netting it must then be replaced in its entirety. These costs will be assessed to anyone responsible for a fall into the protective netting.

If you have any questions about any rules, feel free to ask the check-in desk before heading to your bay.', true)
ON CONFLICT ("version") DO NOTHING;
