-- Lead outcomes. IF NOT EXISTS because an earlier preview build already added
-- NO_RESPONSE to the shared database.
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'REPLIED';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'NO_RESPONSE';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "wonValue" INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

-- Exact booking-step tracking.
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "furthestStep" INTEGER NOT NULL DEFAULT 0;

-- Email health stamps.
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "emailLastOkAt" TIMESTAMP(3);
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "emailLastFailAt" TIMESTAMP(3);
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "emailFailAlertAt" TIMESTAMP(3);

-- Held emails.
DO $$ BEGIN
  CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'SENT', 'GAVE_UP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EmailOutbox" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "to" TEXT[],
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "icsContent" TEXT,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EmailOutbox_status_nextAttemptAt_idx" ON "EmailOutbox"("status", "nextAttemptAt");
