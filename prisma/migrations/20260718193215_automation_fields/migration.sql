-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "balanceReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "reviewNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "thankYouSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "dayDigestSentFor" TEXT,
ADD COLUMN     "reviewUrl" TEXT;
