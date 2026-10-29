-- Follow-up closer for unanswered party inquiries (src/lib/closer.ts), plus the
-- inquiry form's "OK to text me" consent. Additive only: existing leads start at
-- step 0 with no consent, and nothing runs until LEAD_CLOSER=on.
ALTER TABLE "Lead" ADD COLUMN "textConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "closerStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "closerLastAt" TIMESTAMP(3),
ADD COLUMN "closerStoppedAt" TIMESTAMP(3);
