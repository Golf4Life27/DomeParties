-- AlterTable
ALTER TABLE "BayRate" ADD COLUMN     "flatPerBay" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "serviceChargeOnGolf" BOOLEAN NOT NULL DEFAULT false;
