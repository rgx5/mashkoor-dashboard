-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "ownsBooking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "terms" TEXT;

