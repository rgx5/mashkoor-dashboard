-- CreateEnum
CREATE TYPE "FinanceDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "FinanceCategory" AS ENUM ('SUPPLIER_PAYMENT', 'SUPPLIER_REFUND', 'SALARY', 'RENT_UTILITIES', 'MARKETING', 'OFFICE', 'TRAVEL', 'TAXES_FEES', 'OTHER_EXPENSE', 'OTHER_INCOME');

-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id" UUID NOT NULL,
    "entryNo" TEXT NOT NULL,
    "direction" "FinanceDirection" NOT NULL,
    "category" "FinanceCategory" NOT NULL,
    "amount" INTEGER NOT NULL,
    "entryDate" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "party" TEXT,
    "bookingId" UUID,
    "reference" TEXT,
    "notes" TEXT,
    "reversalOfId" UUID,
    "receiptKey" TEXT,
    "receiptSha" TEXT,
    "receiptName" TEXT,
    "receiptMime" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEntry_entryNo_key" ON "FinanceEntry"("entryNo");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEntry_reversalOfId_key" ON "FinanceEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "FinanceEntry_entryDate_idx" ON "FinanceEntry"("entryDate");

-- CreateIndex
CREATE INDEX "FinanceEntry_bookingId_idx" ON "FinanceEntry"("bookingId");

-- CreateIndex
CREATE INDEX "FinanceEntry_category_idx" ON "FinanceEntry"("category");

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinanceEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
