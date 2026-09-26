-- CreateEnum
CREATE TYPE "PaymentLinkStatus" AS ENUM ('ACTIVE', 'PAID', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ItineraryStatus" AS ENUM ('DRAFT', 'SHARED', 'ACCEPTED', 'CONVERTED');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'GATEWAY';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancelRequestReason" TEXT,
ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "gatewayRef" TEXT,
ADD COLUMN     "paymentLinkId" UUID;

-- CreateTable
CREATE TABLE "PaymentLink" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "bookingId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "gatewayOrderId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dedupeKey" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Itinerary" (
    "id" UUID NOT NULL,
    "refNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL DEFAULT 'HOLIDAY',
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "status" "ItineraryStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" UUID,
    "leadId" UUID,
    "ownerId" UUID,
    "destination" TEXT,
    "travelFrom" DATE,
    "travelTo" DATE,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "days" JSONB NOT NULL DEFAULT '[]',
    "lines" JSONB NOT NULL DEFAULT '[]',
    "inclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "terms" TEXT,
    "totalPrice" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "shareToken" TEXT,
    "sharedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedBy" TEXT,
    "convertedBookingId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Itinerary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_token_key" ON "PaymentLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_gatewayOrderId_key" ON "PaymentLink"("gatewayOrderId");

-- CreateIndex
CREATE INDEX "PaymentLink_bookingId_status_idx" ON "PaymentLink"("bookingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_dedupeKey_key" ON "NotificationLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationLog_status_createdAt_idx" ON "NotificationLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_entityType_entityId_idx" ON "NotificationLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Itinerary_refNo_key" ON "Itinerary"("refNo");

-- CreateIndex
CREATE UNIQUE INDEX "Itinerary_shareToken_key" ON "Itinerary"("shareToken");

-- CreateIndex
CREATE INDEX "Itinerary_status_ownerId_idx" ON "Itinerary"("status", "ownerId");

-- CreateIndex
CREATE INDEX "Itinerary_customerId_idx" ON "Itinerary"("customerId");

-- CreateIndex
CREATE INDEX "Itinerary_leadId_idx" ON "Itinerary"("leadId");

-- CreateIndex
CREATE INDEX "Itinerary_isTemplate_idx" ON "Itinerary"("isTemplate");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Itinerary" ADD CONSTRAINT "Itinerary_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Itinerary" ADD CONSTRAINT "Itinerary_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Itinerary" ADD CONSTRAINT "Itinerary_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
