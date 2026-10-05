-- CreateTable
CREATE TABLE "TransportOption" (
    "id" UUID NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "fromPlace" TEXT NOT NULL,
    "toPlace" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 4,
    "costPrice" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "foreignAmount" DOUBLE PRECISION,
    "fxRate" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransportOption_fromPlace_toPlace_idx" ON "TransportOption"("fromPlace", "toPlace");

-- CreateIndex
CREATE INDEX "TransportOption_active_idx" ON "TransportOption"("active");
