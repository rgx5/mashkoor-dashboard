-- AlterTable
ALTER TABLE "BookingItem" ADD COLUMN     "packageDepartureId" UUID;

-- CreateTable
CREATE TABLE "PackageDeparture" (
    "id" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "departureDate" DATE NOT NULL,
    "returnDate" DATE,
    "pricePerHead" INTEGER NOT NULL,
    "depositPerHead" INTEGER,
    "totalSeats" INTEGER NOT NULL,
    "bookedSeats" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageDeparture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackageDeparture_packageId_departureDate_idx" ON "PackageDeparture"("packageId", "departureDate");

-- AddForeignKey
ALTER TABLE "PackageDeparture" ADD CONSTRAINT "PackageDeparture_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_packageDepartureId_fkey" FOREIGN KEY ("packageDepartureId") REFERENCES "PackageDeparture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

