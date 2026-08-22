-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('FUNDRAISER', 'CORPORATE', 'CHAMBER', 'BOOSTER', 'MILESTONE', 'OTHER');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "organization" TEXT,
    "contactRole" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "kind" "AccountKind" NOT NULL DEFAULT 'OTHER',
    "typicalMonth" INTEGER,
    "lastEventOn" TIMESTAMP(3),
    "lastEventValue" INTEGER,
    "lastHeadcount" INTEGER,
    "timesBooked" INTEGER NOT NULL DEFAULT 1,
    "relationshipOwner" TEXT,
    "notes" TEXT,
    "nextOutreachOn" TIMESTAMP(3),
    "lastOutreachSent" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- The outreach cron scans for due accounts on every run, so the filter it uses
-- is the one worth indexing.
CREATE INDEX "Account_active_nextOutreachOn_idx" ON "Account"("active", "nextOutreachOn");
