-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "exclusive" BOOLEAN NOT NULL DEFAULT false;
