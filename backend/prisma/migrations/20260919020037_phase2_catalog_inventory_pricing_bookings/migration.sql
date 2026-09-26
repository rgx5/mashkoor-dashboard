-- CreateEnum
CREATE TYPE "MealPlan" AS ENUM ('ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD', 'ALL_INCLUSIVE');

-- CreateEnum
CREATE TYPE "CabinClass" AS ENUM ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST');

-- CreateEnum
CREATE TYPE "PricingScope" AS ENUM ('B2C', 'B2B');

-- CreateEnum
CREATE TYPE "PricingAdjustmentType" AS ENUM ('PERCENT_MARKUP', 'FIXED_MARKUP', 'FIXED_PRICE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('INQUIRY', 'QUOTE', 'PENDING_PAYMENT', 'PENDING_APPROVAL', 'IN_PROGRESS', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "BookingItemType" AS ENUM ('FLIGHT', 'HOTEL', 'PACKAGE', 'VISA', 'TICKETING', 'OTHER');

-- CreateTable
CREATE TABLE "Destination" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "summary" TEXT,
    "description" TEXT,
    "heroImageUrl" TEXT,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" UUID NOT NULL,
    "refCode" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL,
    "destinationId" UUID,
    "summary" TEXT,
    "description" TEXT,
    "nights" INTEGER NOT NULL DEFAULT 0,
    "days" INTEGER NOT NULL DEFAULT 0,
    "heroImageUrl" TEXT,
    "galleryUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "itinerary" JSONB NOT NULL DEFAULT '[]',
    "hotels" JSONB NOT NULL DEFAULT '[]',
    "priceTiers" JSONB NOT NULL DEFAULT '[]',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" UUID NOT NULL,
    "customerName" TEXT NOT NULL,
    "location" TEXT,
    "productType" "ProductType",
    "rating" INTEGER NOT NULL DEFAULT 5,
    "quote" TEXT NOT NULL,
    "photoUrl" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faq" (
    "id" UUID NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'SA',
    "category" INTEGER,
    "address" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomType" (
    "id" UUID NOT NULL,
    "hotelId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "maxAdults" INTEGER NOT NULL DEFAULT 2,
    "maxChildren" INTEGER NOT NULL DEFAULT 1,
    "mealPlan" "MealPlan" NOT NULL DEFAULT 'BREAKFAST',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePeriod" (
    "id" UUID NOT NULL,
    "roomTypeId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "costPrice" INTEGER NOT NULL,
    "totalRooms" INTEGER NOT NULL,
    "bookedRooms" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlightSeatBlock" (
    "id" UUID NOT NULL,
    "airline" TEXT NOT NULL,
    "flightNumber" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "departureAt" TIMESTAMP(3) NOT NULL,
    "arrivalAt" TIMESTAMP(3),
    "cabinClass" "CabinClass" NOT NULL DEFAULT 'ECONOMY',
    "totalSeats" INTEGER NOT NULL,
    "bookedSeats" INTEGER NOT NULL DEFAULT 0,
    "costPrice" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlightSeatBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "PricingScope" NOT NULL,
    "productType" "ProductType",
    "adjustmentType" "PricingAdjustmentType" NOT NULL,
    "value" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "validFrom" DATE,
    "validTo" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "refNo" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "leadId" UUID,
    "productType" "ProductType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'INQUIRY',
    "destination" TEXT,
    "travelFrom" DATE,
    "travelTo" DATE,
    "notes" TEXT,
    "totalCost" INTEGER NOT NULL DEFAULT 0,
    "totalSell" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "cancellationFee" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "source" "LeadSource" NOT NULL DEFAULT 'OTHER',
    "partnerId" UUID,
    "ownerId" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingItem" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "type" "BookingItemType" NOT NULL,
    "description" TEXT NOT NULL,
    "packageId" UUID,
    "flightSeatBlockId" UUID,
    "ratePeriodId" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "costPrice" INTEGER NOT NULL DEFAULT 0,
    "sellPrice" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BookingTravelers" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_BookingTravelers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Destination_slug_key" ON "Destination"("slug");

-- CreateIndex
CREATE INDEX "Destination_published_sortOrder_idx" ON "Destination"("published", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Package_refCode_key" ON "Package"("refCode");

-- CreateIndex
CREATE UNIQUE INDEX "Package_slug_key" ON "Package"("slug");

-- CreateIndex
CREATE INDEX "Package_published_productType_idx" ON "Package"("published", "productType");

-- CreateIndex
CREATE INDEX "Package_destinationId_idx" ON "Package"("destinationId");

-- CreateIndex
CREATE INDEX "Testimonial_published_sortOrder_idx" ON "Testimonial"("published", "sortOrder");

-- CreateIndex
CREATE INDEX "Faq_published_category_sortOrder_idx" ON "Faq"("published", "category", "sortOrder");

-- CreateIndex
CREATE INDEX "Hotel_city_idx" ON "Hotel"("city");

-- CreateIndex
CREATE INDEX "RoomType_hotelId_idx" ON "RoomType"("hotelId");

-- CreateIndex
CREATE INDEX "RatePeriod_roomTypeId_startDate_endDate_idx" ON "RatePeriod"("roomTypeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "FlightSeatBlock_departureAt_idx" ON "FlightSeatBlock"("departureAt");

-- CreateIndex
CREATE INDEX "FlightSeatBlock_origin_destination_idx" ON "FlightSeatBlock"("origin", "destination");

-- CreateIndex
CREATE INDEX "PricingRule_scope_productType_active_priority_idx" ON "PricingRule"("scope", "productType", "active", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_refNo_key" ON "Booking"("refNo");

-- CreateIndex
CREATE INDEX "Booking_status_ownerId_idx" ON "Booking"("status", "ownerId");

-- CreateIndex
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");

-- CreateIndex
CREATE INDEX "Booking_partnerId_idx" ON "Booking"("partnerId");

-- CreateIndex
CREATE INDEX "Booking_createdAt_idx" ON "Booking"("createdAt");

-- CreateIndex
CREATE INDEX "BookingItem_bookingId_idx" ON "BookingItem"("bookingId");

-- CreateIndex
CREATE INDEX "_BookingTravelers_B_index" ON "_BookingTravelers"("B");

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePeriod" ADD CONSTRAINT "RatePeriod_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_flightSeatBlockId_fkey" FOREIGN KEY ("flightSeatBlockId") REFERENCES "FlightSeatBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_ratePeriodId_fkey" FOREIGN KEY ("ratePeriodId") REFERENCES "RatePeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BookingTravelers" ADD CONSTRAINT "_BookingTravelers_A_fkey" FOREIGN KEY ("A") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BookingTravelers" ADD CONSTRAINT "_BookingTravelers_B_fkey" FOREIGN KEY ("B") REFERENCES "Traveler"("id") ON DELETE CASCADE ON UPDATE CASCADE;
