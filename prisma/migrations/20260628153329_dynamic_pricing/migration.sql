-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "offPeakDiscountPct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "peakSurchargePct" INTEGER NOT NULL DEFAULT 15;
