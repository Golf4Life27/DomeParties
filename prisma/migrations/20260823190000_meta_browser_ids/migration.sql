-- Meta's own browser cookies, stored so server-side Conversions API events can
-- carry them. Meta flags low fbp coverage as a high-priority data-quality issue:
-- fbp is a primary signal for matching a browser event and a server event to the
-- same person, which is what deduplication and attribution both depend on.
ALTER TABLE "Lead" ADD COLUMN     "fbp" TEXT,
ADD COLUMN     "fbc" TEXT;

ALTER TABLE "Booking" ADD COLUMN     "fbp" TEXT,
ADD COLUMN     "fbc" TEXT;
