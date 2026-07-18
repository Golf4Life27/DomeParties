-- AlterTable
ALTER TABLE "AddOn" ADD COLUMN     "choiceCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "choiceList" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "BookingAddOn" ADD COLUMN     "choices" TEXT[] DEFAULT ARRAY[]::TEXT[];
