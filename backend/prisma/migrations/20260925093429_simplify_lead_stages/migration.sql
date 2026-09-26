-- Lead stages simplified to New / Contacted / Quotation / Waiting for payment / Won / Lost.
-- Existing rows are remapped: requirement collected -> contacted, proposal shared and follow-up -> quotation, post-travel -> won.
BEGIN;
CREATE TYPE "LeadStage_new" AS ENUM ('NEW', 'CONTACTED', 'QUOTATION', 'WAITING_PAYMENT', 'WON', 'LOST');
ALTER TABLE "Lead" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "Lead" ALTER COLUMN "stage" TYPE "LeadStage_new" USING (
  CASE "stage"::text
    WHEN 'REQUIREMENT_COLLECTED' THEN 'CONTACTED'
    WHEN 'PROPOSAL_SHARED' THEN 'QUOTATION'
    WHEN 'FOLLOW_UP' THEN 'QUOTATION'
    WHEN 'POST_TRAVEL' THEN 'WON'
    ELSE "stage"::text
  END
)::"LeadStage_new";
ALTER TABLE "Lead" ALTER COLUMN "stage" SET DEFAULT 'NEW';
ALTER TYPE "LeadStage" RENAME TO "LeadStage_old";
ALTER TYPE "LeadStage_new" RENAME TO "LeadStage";
DROP TYPE "LeadStage_old";
COMMIT;
