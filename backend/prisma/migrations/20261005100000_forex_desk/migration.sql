-- CreateEnum
CREATE TYPE "ForexTxnType" AS ENUM ('SELL', 'BUY');

-- CreateEnum
CREATE TYPE "ForexForm" AS ENUM ('CASH', 'CARD', 'TRANSFER');

-- AlterTable
ALTER TABLE "Currency" ADD COLUMN     "buyRate" DOUBLE PRECISION,
ADD COLUMN     "sellRate" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ForexTransaction" (
    "id" UUID NOT NULL,
    "refNo" TEXT NOT NULL,
    "type" "ForexTxnType" NOT NULL,
    "form" "ForexForm" NOT NULL DEFAULT 'CASH',
    "customerId" UUID,
    "customerName" TEXT NOT NULL,
    "phone" TEXT,
    "currency" CHAR(3) NOT NULL,
    "foreignAmount" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "inrAmount" INTEGER NOT NULL,
    "costRate" DOUBLE PRECISION,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "passportNo" TEXT,
    "panNo" TEXT,
    "purpose" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForexTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForexPurchase" (
    "id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "foreignAmount" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "inrAmount" INTEGER NOT NULL,
    "supplier" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "purchaseDate" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForexPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForexTransaction_refNo_key" ON "ForexTransaction"("refNo");

-- CreateIndex
CREATE INDEX "ForexTransaction_createdAt_idx" ON "ForexTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "ForexTransaction_currency_idx" ON "ForexTransaction"("currency");

-- CreateIndex
CREATE INDEX "ForexTransaction_customerId_idx" ON "ForexTransaction"("customerId");

-- CreateIndex
CREATE INDEX "ForexPurchase_currency_idx" ON "ForexPurchase"("currency");

-- CreateIndex
CREATE INDEX "ForexPurchase_purchaseDate_idx" ON "ForexPurchase"("purchaseDate");

-- AddForeignKey
ALTER TABLE "ForexTransaction" ADD CONSTRAINT "ForexTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

