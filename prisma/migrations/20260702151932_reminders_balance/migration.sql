-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "balancePaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "balancePaidAt" TIMESTAMP(3),
ADD COLUMN     "reminder1SentAt" TIMESTAMP(3),
ADD COLUMN     "reminder7SentAt" TIMESTAMP(3);
