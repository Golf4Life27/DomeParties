-- AlterEnum
ALTER TYPE "PricingType" ADD VALUE 'BAY_RATE';

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "bays" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "BayRate" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "daysOfWeek" INTEGER[],
    "startMinute" INTEGER NOT NULL DEFAULT 0,
    "endMinute" INTEGER NOT NULL DEFAULT 1440,
    "minBays" INTEGER NOT NULL DEFAULT 1,
    "ratePerHour" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BayRate_pkey" PRIMARY KEY ("id")
);
