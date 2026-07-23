-- CreateTable
CREATE TABLE "ExternalReservation" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'trackman',
    "date" TIMESTAMP(3) NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "bayCount" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflictAlert" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "dateStr" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ConflictAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalReservation_date_idx" ON "ExternalReservation"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ConflictAlert_signature_key" ON "ConflictAlert"("signature");
