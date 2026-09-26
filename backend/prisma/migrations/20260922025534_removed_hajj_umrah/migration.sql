/*
  Warnings:

  - The values [HAJJ,UMRAH] on the enum `ProductType` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[reviewBookingId]` on the table `Testimonial` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TripType" AS ENUM ('FIT', 'GROUP_TOUR', 'CUSTOMIZED');

-- CreateEnum
CREATE TYPE "BookingDocumentKind" AS ENUM ('TICKET', 'VISA', 'VOUCHER', 'INSURANCE', 'ITINERARY', 'INVOICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('SUPPLIER', 'AGENT', 'GENERAL');

-- Data fixup: HAJJ/UMRAH is dropped from ProductType (it's now classified generically, e.g. PACKAGE — see
-- CRM_DIRECTION_DESIGN.md). Existing demo/smoke-test rows are remapped before the enum is narrowed, or the cast
-- below fails outright.
UPDATE "Lead" SET "productType" = 'PACKAGE' WHERE "productType" IN ('HAJJ', 'UMRAH');
UPDATE "Package" SET "productType" = 'PACKAGE' WHERE "productType" IN ('HAJJ', 'UMRAH');
UPDATE "Booking" SET "productType" = 'PACKAGE' WHERE "productType" IN ('HAJJ', 'UMRAH');
UPDATE "PricingRule" SET "productType" = 'PACKAGE' WHERE "productType" IN ('HAJJ', 'UMRAH');
UPDATE "Testimonial" SET "productType" = 'PACKAGE' WHERE "productType" IN ('HAJJ', 'UMRAH');
UPDATE "Itinerary" SET "productType" = 'PACKAGE' WHERE "productType" IN ('HAJJ', 'UMRAH');

-- AlterEnum
BEGIN;
CREATE TYPE "ProductType_new" AS ENUM ('HOLIDAY', 'VISA', 'FLIGHT', 'HOTEL', 'PACKAGE', 'OTHER');
ALTER TABLE "public"."Itinerary" ALTER COLUMN "productType" DROP DEFAULT;
ALTER TABLE "public"."Lead" ALTER COLUMN "productType" DROP DEFAULT;
ALTER TABLE "Lead" ALTER COLUMN "productType" TYPE "ProductType_new" USING ("productType"::text::"ProductType_new");
ALTER TABLE "Package" ALTER COLUMN "productType" TYPE "ProductType_new" USING ("productType"::text::"ProductType_new");
ALTER TABLE "Testimonial" ALTER COLUMN "productType" TYPE "ProductType_new" USING ("productType"::text::"ProductType_new");
ALTER TABLE "PricingRule" ALTER COLUMN "productType" TYPE "ProductType_new" USING ("productType"::text::"ProductType_new");
ALTER TABLE "Booking" ALTER COLUMN "productType" TYPE "ProductType_new" USING ("productType"::text::"ProductType_new");
ALTER TABLE "Itinerary" ALTER COLUMN "productType" TYPE "ProductType_new" USING ("productType"::text::"ProductType_new");
ALTER TYPE "ProductType" RENAME TO "ProductType_old";
ALTER TYPE "ProductType_new" RENAME TO "ProductType";
DROP TYPE "public"."ProductType_old";
ALTER TABLE "Itinerary" ALTER COLUMN "productType" SET DEFAULT 'HOLIDAY';
ALTER TABLE "Lead" ALTER COLUMN "productType" SET DEFAULT 'OTHER';
COMMIT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "tripType" "TripType" NOT NULL DEFAULT 'FIT';

-- AlterTable
ALTER TABLE "Itinerary" ADD COLUMN     "changesRequestNote" TEXT,
ADD COLUMN     "changesRequestedAt" TIMESTAMP(3),
ADD COLUMN     "tripType" "TripType" NOT NULL DEFAULT 'FIT';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "quotedAmount" INTEGER,
ADD COLUMN     "tripType" "TripType" NOT NULL DEFAULT 'FIT';

-- AlterTable
ALTER TABLE "Testimonial" ADD COLUMN     "reviewBookingId" UUID;

-- CreateTable
CREATE TABLE "TripUpdate" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingDocument" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "kind" "BookingDocumentKind" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "visibleToCustomer" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "type" "ContactType" NOT NULL DEFAULT 'GENERAL',
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "altPhone" TEXT,
    "email" TEXT,
    "company" TEXT,
    "designation" TEXT,
    "city" TEXT,
    "state" TEXT,
    "notes" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripUpdate_bookingId_createdAt_idx" ON "TripUpdate"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingDocument_bookingId_createdAt_idx" ON "BookingDocument"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_type_name_idx" ON "Contact"("type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Testimonial_reviewBookingId_key" ON "Testimonial"("reviewBookingId");

-- AddForeignKey
ALTER TABLE "TripUpdate" ADD CONSTRAINT "TripUpdate_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripUpdate" ADD CONSTRAINT "TripUpdate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingDocument" ADD CONSTRAINT "BookingDocument_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingDocument" ADD CONSTRAINT "BookingDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
