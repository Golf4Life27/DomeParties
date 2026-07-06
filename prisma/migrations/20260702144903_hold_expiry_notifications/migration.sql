-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "holdExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "holdMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "staffNotifyEmail" TEXT;
