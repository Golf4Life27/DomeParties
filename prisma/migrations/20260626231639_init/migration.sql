-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('BAY', 'SIMULATOR', 'EVENT_SPACE');

-- CreateEnum
CREATE TYPE "PricingType" AS ENUM ('PER_PERSON', 'FLAT');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('BIRTHDAY', 'GROUP', 'CORPORATE', 'LEAGUE', 'BACHELOR', 'OTHER');

-- CreateEnum
CREATE TYPE "AddOnUnit" AS ENUM ('FLAT', 'PER_PERSON', 'PER_30_MIN');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('DRAFT', 'PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'PROPOSAL_SENT', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "Setting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "openHour" INTEGER NOT NULL DEFAULT 9,
    "closeHour" INTEGER NOT NULL DEFAULT 22,
    "bayCapacity" INTEGER NOT NULL DEFAULT 6,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 30,
    "leadTimeDaysOnline" INTEGER NOT NULL DEFAULT 7,
    "depositPercent" INTEGER NOT NULL DEFAULT 10,
    "serviceChargePct" INTEGER NOT NULL DEFAULT 20,
    "taxPct" DOUBLE PRECISION NOT NULL DEFAULT 7.25,
    "cancelHoursLarge" INTEGER NOT NULL DEFAULT 48,
    "cancelHoursSmall" INTEGER NOT NULL DEFAULT 24,
    "cancelLargeThreshold" INTEGER NOT NULL DEFAULT 15,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL DEFAULT 'BAY',
    "floor" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 6,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL DEFAULT 'BIRTHDAY',
    "description" TEXT NOT NULL,
    "includes" TEXT[],
    "durationMinutes" INTEGER NOT NULL DEFAULT 120,
    "pricingType" "PricingType" NOT NULL DEFAULT 'PER_PERSON',
    "pricePerPerson" INTEGER NOT NULL DEFAULT 0,
    "flatPrice" INTEGER NOT NULL DEFAULT 0,
    "minGuests" INTEGER NOT NULL DEFAULT 1,
    "maxGuests" INTEGER NOT NULL DEFAULT 180,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FnbPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pricingType" "PricingType" NOT NULL DEFAULT 'PER_PERSON',
    "price" INTEGER NOT NULL DEFAULT 0,
    "dietaryNotes" TEXT,
    "serviceCharge" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FnbPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddOn" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Extras',
    "price" INTEGER NOT NULL DEFAULT 0,
    "unit" "AddOnUnit" NOT NULL DEFAULT 'FLAT',
    "serviceCharge" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AddOn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'DRAFT',
    "eventType" "EventType" NOT NULL DEFAULT 'BIRTHDAY',
    "date" TIMESTAMP(3) NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "baysNeeded" INTEGER NOT NULL DEFAULT 1,
    "packageId" TEXT,
    "fnbPackageId" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "notes" TEXT,
    "waiverSigned" BOOLEAN NOT NULL DEFAULT false,
    "waiverSignedName" TEXT,
    "waiverGuardian" BOOLEAN NOT NULL DEFAULT false,
    "waiverSignedAt" TIMESTAMP(3),
    "packageTotal" INTEGER NOT NULL DEFAULT 0,
    "fnbTotal" INTEGER NOT NULL DEFAULT 0,
    "addOnsTotal" INTEGER NOT NULL DEFAULT 0,
    "serviceCharge" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "depositAmount" INTEGER NOT NULL DEFAULT 0,
    "depositPaid" BOOLEAN NOT NULL DEFAULT false,
    "balanceDue" INTEGER NOT NULL DEFAULT 0,
    "stripePaymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAddOn" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "addOnId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "lineTotal" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BookingAddOn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingResource" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,

    CONSTRAINT "BookingResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL DEFAULT 'CORPORATE',
    "preferredDate" TIMESTAMP(3),
    "dateFlexible" BOOLEAN NOT NULL DEFAULT false,
    "headcountMin" INTEGER,
    "headcountMax" INTEGER,
    "budget" TEXT,
    "mustHaves" TEXT[],
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "message" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT DEFAULT 'website',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");

-- CreateIndex
CREATE INDEX "Booking_date_status_idx" ON "Booking"("date", "status");

-- CreateIndex
CREATE INDEX "Booking_status_updatedAt_idx" ON "Booking"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAddOn_bookingId_addOnId_key" ON "BookingAddOn"("bookingId", "addOnId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingResource_bookingId_resourceId_key" ON "BookingResource"("bookingId", "resourceId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_fnbPackageId_fkey" FOREIGN KEY ("fnbPackageId") REFERENCES "FnbPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAddOn" ADD CONSTRAINT "BookingAddOn_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAddOn" ADD CONSTRAINT "BookingAddOn_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "AddOn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingResource" ADD CONSTRAINT "BookingResource_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingResource" ADD CONSTRAINT "BookingResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
