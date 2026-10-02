-- AlterTable
ALTER TABLE "User" ADD COLUMN     "featureAccess" TEXT[] DEFAULT ARRAY[]::TEXT[];
