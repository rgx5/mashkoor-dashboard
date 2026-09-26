-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('STAFF', 'PARTNER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'OPS_MANAGER', 'SALES_AGENT', 'PARTNER_ADMIN', 'PARTNER_USER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "Portal" AS ENUM ('admin', 'b2b', 'b2c');

-- CreateEnum
CREATE TYPE "UserTokenPurpose" AS ENUM ('INVITE', 'PASSWORD_RESET', 'LOGIN_OTP');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'FAMILY', 'GROUP', 'CORPORATE');

-- CreateEnum
CREATE TYPE "ContactChannel" AS ENUM ('WHATSAPP', 'CALL', 'EMAIL');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'WHATSAPP', 'INSTAGRAM', 'PHONE', 'WALK_IN', 'REFERRAL', 'B2B', 'B2C_PORTAL', 'OTHER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "TravelerRelation" AS ENUM ('SELF', 'SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'MAHRAM', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('HAJJ', 'UMRAH', 'HOLIDAY', 'VISA', 'FLIGHT', 'HOTEL', 'PACKAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'REQUIREMENT_COLLECTED', 'PROPOSAL_SHARED', 'FOLLOW_UP', 'WON', 'LOST', 'POST_TRAVEL');

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "LostReason" AS ENUM ('PRICE', 'DATES_CHANGED', 'BOOKED_ELSEWHERE', 'NOT_REACHABLE', 'NOT_SERIOUS', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityEntityType" AS ENUM ('LEAD', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'STAGE_CHANGE', 'STATUS_CHANGE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InboundChannel" AS ENUM ('WEBSITE', 'WHATSAPP', 'INSTAGRAM', 'META_LEAD_AD', 'PAYMENT_GATEWAY');

-- CreateEnum
CREATE TYPE "InboundEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "type" "UserType" NOT NULL,
    "role" "Role" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "partnerId" UUID,
    "customerId" UUID,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "lastLoginAt" TIMESTAMP(3),
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "portal" "Portal" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "UserTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "refNo" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "altPhone" TEXT,
    "email" TEXT,
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT true,
    "preferredChannel" "ContactChannel" NOT NULL DEFAULT 'WHATSAPP',
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "LeadSource" NOT NULL DEFAULT 'OTHER',
    "partnerId" UUID,
    "ownerId" UUID,
    "notes" TEXT,
    "marketingConsentAt" TIMESTAMP(3),
    "mergedIntoId" UUID,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Traveler" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "title" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "gender" "Gender",
    "dob" DATE,
    "nationality" TEXT NOT NULL DEFAULT 'IN',
    "relation" "TravelerRelation" NOT NULL DEFAULT 'SELF',
    "passportNoEnc" TEXT,
    "passportLast4" TEXT,
    "passportExpiry" DATE,
    "passportIssuePlace" TEXT,
    "mealPreference" TEXT,
    "specialNeeds" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Traveler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" UUID NOT NULL,
    "refNo" TEXT NOT NULL,
    "customerId" UUID,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "source" "LeadSource" NOT NULL,
    "sourceDetail" TEXT,
    "attribution" JSONB,
    "productType" "ProductType" NOT NULL DEFAULT 'OTHER',
    "destination" TEXT,
    "travelFrom" DATE,
    "travelTo" DATE,
    "flexibleDates" BOOLEAN NOT NULL DEFAULT false,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "requirements" TEXT,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "lostReason" "LostReason",
    "priority" "LeadPriority" NOT NULL DEFAULT 'WARM',
    "ownerId" UUID,
    "partnerId" UUID,
    "nextFollowUpAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wonBookingId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" UUID NOT NULL,
    "entityType" "ActivityEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "type" "ActivityType" NOT NULL,
    "body" TEXT NOT NULL,
    "meta" JSONB,
    "customerId" UUID,
    "leadId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "LeadPriority" NOT NULL DEFAULT 'WARM',
    "assigneeId" UUID NOT NULL,
    "leadId" UUID,
    "customerId" UUID,
    "completedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundEvent" (
    "id" UUID NOT NULL,
    "channel" "InboundChannel" NOT NULL,
    "externalId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "InboundEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "leadId" UUID,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "portal" "Portal",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "kind" TEXT,
    "visibility" "FileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "NumberSequence" (
    "key" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("key","year")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_type_status_idx" ON "User"("type", "status");

-- CreateIndex
CREATE INDEX "User_partnerId_idx" ON "User"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "UserToken_userId_purpose_idx" ON "UserToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "UserToken_tokenHash_idx" ON "UserToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_refNo_key" ON "Customer"("refNo");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_ownerId_idx" ON "Customer"("ownerId");

-- CreateIndex
CREATE INDEX "Customer_partnerId_idx" ON "Customer"("partnerId");

-- CreateIndex
CREATE INDEX "Customer_deletedAt_createdAt_idx" ON "Customer"("deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Traveler_customerId_idx" ON "Traveler"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_refNo_key" ON "Lead"("refNo");

-- CreateIndex
CREATE INDEX "Lead_stage_ownerId_idx" ON "Lead"("stage", "ownerId");

-- CreateIndex
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");

-- CreateIndex
CREATE INDEX "Lead_customerId_idx" ON "Lead"("customerId");

-- CreateIndex
CREATE INDEX "Lead_nextFollowUpAt_idx" ON "Lead"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Activity_entityType_entityId_createdAt_idx" ON "Activity"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_customerId_createdAt_idx" ON "Activity"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_dueAt_idx" ON "Task"("assigneeId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_leadId_idx" ON "Task"("leadId");

-- CreateIndex
CREATE INDEX "Task_customerId_idx" ON "Task"("customerId");

-- CreateIndex
CREATE INDEX "InboundEvent_status_createdAt_idx" ON "InboundEvent"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboundEvent_channel_externalId_key" ON "InboundEvent"("channel", "externalId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "File_storageKey_key" ON "File"("storageKey");

-- CreateIndex
CREATE INDEX "File_entityType_entityId_idx" ON "File"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserToken" ADD CONSTRAINT "UserToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traveler" ADD CONSTRAINT "Traveler_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
