-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "utmSource" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmContent" TEXT,
ADD COLUMN     "landingPath" TEXT,
ADD COLUMN     "fbclid" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "utmSource" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmContent" TEXT,
ADD COLUMN     "landingPath" TEXT,
ADD COLUMN     "fbclid" TEXT;
