CREATE TABLE "Currency" (
    "code" CHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "rateToInr" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);

-- INR is the base currency: always present, always rate 1.
INSERT INTO "Currency" ("code", "name", "symbol", "rateToInr", "active", "updatedAt")
VALUES ('INR', 'Indian Rupee', '₹', 1, true, CURRENT_TIMESTAMP);
