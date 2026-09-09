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
