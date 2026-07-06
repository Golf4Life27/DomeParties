-- AlterTable
ALTER TABLE "BayRate" ADD COLUMN     "minHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tag" TEXT NOT NULL DEFAULT 'birthday';

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "rateTag" TEXT NOT NULL DEFAULT 'birthday';

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "cardFeePct" DOUBLE PRECISION NOT NULL DEFAULT 0;
