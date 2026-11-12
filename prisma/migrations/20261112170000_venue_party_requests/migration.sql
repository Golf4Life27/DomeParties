-- PartyDesk pilot: one row per counted party request at another venue.
-- Adds a new table only; no existing table or row is touched.
CREATE TABLE "VenuePartyRequest" (
    "id" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "partyDate" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,

    CONSTRAINT "VenuePartyRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VenuePartyRequest_venue_createdAt_idx" ON "VenuePartyRequest"("venue", "createdAt");
