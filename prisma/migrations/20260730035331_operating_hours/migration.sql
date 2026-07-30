-- CreateEnum
CREATE TYPE "HoursKind" AS ENUM ('GOLF', 'PARTY');

-- CreateTable
CREATE TABLE "OperatingHours" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "HoursKind" NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "openMinute" INTEGER NOT NULL DEFAULT 540,
    "closeMinute" INTEGER NOT NULL DEFAULT 1320,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OperatingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Closure" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startMinute" INTEGER NOT NULL DEFAULT 0,
    "endMinute" INTEGER NOT NULL DEFAULT 1440,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Closure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperatingHours_kind_dayOfWeek_idx" ON "OperatingHours"("kind", "dayOfWeek");

-- CreateIndex
CREATE INDEX "Closure_date_idx" ON "Closure"("date");
