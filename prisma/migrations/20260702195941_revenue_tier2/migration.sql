-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "promoCode" TEXT,
ADD COLUMN     "promoDiscount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "recoveryStage" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "followUpSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "percentOff" INTEGER NOT NULL DEFAULT 0,
    "amountOff" INTEGER NOT NULL DEFAULT 0,
    "minTotal" INTEGER NOT NULL DEFAULT 0,
    "appliesDays" INTEGER[],
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "maxRedemptions" INTEGER NOT NULL DEFAULT 0,
    "timesRedeemed" INTEGER NOT NULL DEFAULT 0,
    "featuredInRecovery" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");
