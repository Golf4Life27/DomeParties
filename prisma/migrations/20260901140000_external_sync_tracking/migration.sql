-- Track when each date's Trackman occupancy was last pulled, so a date with no
-- reservations can be told apart from a date we never managed to ask about.
CREATE TABLE "ExternalSync" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'trackman',
    "date" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,

    CONSTRAINT "ExternalSync_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalSync_source_date_key" ON "ExternalSync"("source", "date");
CREATE INDEX "ExternalSync_date_idx" ON "ExternalSync"("date");
