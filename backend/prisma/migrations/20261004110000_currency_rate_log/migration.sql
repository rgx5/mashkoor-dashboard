-- CreateTable
CREATE TABLE "CurrencyRateLog" (
    "id" UUID NOT NULL,
    "code" CHAR(3) NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "previousRate" DOUBLE PRECISION,
    "changedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrencyRateLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CurrencyRateLog_code_createdAt_idx" ON "CurrencyRateLog"("code", "createdAt");

-- Start every existing currency's history with the rate it has today.
INSERT INTO "CurrencyRateLog" ("id", "code", "rate", "previousRate", "createdAt")
SELECT gen_random_uuid(), "code", "rateToInr", NULL, "updatedAt" FROM "Currency";
