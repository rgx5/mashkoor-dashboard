-- AlterTable
ALTER TABLE "BookingItem" ADD COLUMN     "held" BOOLEAN NOT NULL DEFAULT true;

-- Items on bookings that were already cancelled or failed had their inventory released; mark them so a later
-- reopen re-reserves (and a later cancel doesn't release twice).
UPDATE "BookingItem" SET "held" = false WHERE "bookingId" IN (SELECT "id" FROM "Booking" WHERE "status" IN ('CANCELLED', 'FAILED'));
