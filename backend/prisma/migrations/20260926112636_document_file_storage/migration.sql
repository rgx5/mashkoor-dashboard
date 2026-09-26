-- AlterTable
ALTER TABLE "BookingDocument" ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "storageKey" TEXT,
ALTER COLUMN "data" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BookingDocument_storageKey_key" ON "BookingDocument"("storageKey");
