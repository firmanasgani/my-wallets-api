-- =============================================================================
-- Phase 8: Advanced Accounting Features
-- PPh Config | Asset Management (PSAK 16/19) | Approval Workflow | Attachments | KPI Enhancement
-- =============================================================================

-- ─── Step 1: New standalone enums ────────────────────────────────────────────

-- P&L sub-classification for ChartOfAccount
CREATE TYPE "ChartOfAccountSubType" AS ENUM ('OPERATING', 'NON_OPERATING', 'COGS');

-- Journal entry approval workflow statuses
-- Default APPROVED ensures all existing entries remain unaffected
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'PENDING_CHECK', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- Supported withholding tax (PPh) types
CREATE TYPE "TaxType" AS ENUM ('PPN', 'PPH_21', 'PPH_22', 'PPH_23', 'PPH_4_2', 'PPH_15');

-- Asset classification
CREATE TYPE "AssetType" AS ENUM ('TANGIBLE', 'INTANGIBLE');

-- Depreciation / amortisation methods (PSAK 16 & PSAK 19)
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'DOUBLE_DECLINING', 'UNITS_OF_PRODUCTION');

-- Asset lifecycle status
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'DISPOSED', 'FULLY_DEPRECIATED');

-- ─── Step 2: Extend existing enums ───────────────────────────────────────────

-- Add CHECKER role to CompanyMemberRole hierarchy
-- Note: PostgreSQL adds the value at the end by default; order in the ROLE_HIERARCHY map in code defines effective precedence.
ALTER TYPE "CompanyMemberRole" ADD VALUE 'CHECKER';

-- Phase 8 LogActionType additions
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_JOURNAL_SUBMITTED';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_JOURNAL_CHECKED';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_JOURNAL_APPROVED';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_JOURNAL_REJECTED';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_TAX_CONFIG_CREATE';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_TAX_CONFIG_UPDATE';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_TAX_CONFIG_DELETE';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_SUGGESTION_RULE_CREATE';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_SUGGESTION_RULE_UPDATE';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_SUGGESTION_RULE_DELETE';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_ASSET_CREATE';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_ASSET_UPDATE';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_ASSET_DISPOSED';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_ASSET_DEPRECIATION_RUN';

-- ─── Step 3: Alter existing tables ───────────────────────────────────────────

-- Company: approval workflow toggle
ALTER TABLE "Company"
    ADD COLUMN "requiresApprovalWorkflow" BOOLEAN NOT NULL DEFAULT false;

-- ChartOfAccount: P&L sub-classification (nullable — existing rows unaffected)
ALTER TABLE "ChartOfAccount"
    ADD COLUMN "subType" "ChartOfAccountSubType";

-- JournalEntry: approval workflow fields
-- Default APPROVED preserves all existing entries as effective/posted
ALTER TABLE "JournalEntry"
    ADD COLUMN "status"          "JournalEntryStatus" NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN "checkerUserId"   TEXT,
    ADD COLUMN "approverUserId"  TEXT,
    ADD COLUMN "checkedAt"       TIMESTAMP(3),
    ADD COLUMN "approvedAt"      TIMESTAMP(3),
    ADD COLUMN "rejectedAt"      TIMESTAMP(3),
    ADD COLUMN "rejectionNote"   TEXT;

-- Add FK constraints for checker / approver on JournalEntry
ALTER TABLE "JournalEntry"
    ADD CONSTRAINT "JournalEntry_checkerUserId_fkey"
        FOREIGN KEY ("checkerUserId")  REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "JournalEntry_approverUserId_fkey"
        FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Step 4: Backfill subType for existing system COAs ───────────────────────
-- Ensures existing companies already benefit from P&L classification.

UPDATE "ChartOfAccount" SET "subType" = 'OPERATING'
WHERE "isSystem" = true AND "code" IN ('4-001', '4-002');

UPDATE "ChartOfAccount" SET "subType" = 'OPERATING'
WHERE "isSystem" = true AND "code" IN ('5-001', '5-002', '5-003');

UPDATE "ChartOfAccount" SET "subType" = 'COGS'
WHERE "isSystem" = true AND "code" = '5-006';

UPDATE "ChartOfAccount" SET "subType" = 'OPERATING'
WHERE "isSystem" = true AND "code" IN ('5-004', '5-005');

UPDATE "ChartOfAccount" SET "subType" = 'NON_OPERATING'
WHERE "isSystem" = true AND "code" IN ('6-001', '6-002');

UPDATE "ChartOfAccount" SET "subType" = 'NON_OPERATING'
WHERE "isSystem" = true AND "code" IN ('7-001', '7-002');

-- ─── Step 5: New tables ───────────────────────────────────────────────────────

-- TaxConfig: PPh configuration per company
CREATE TABLE "TaxConfig" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "type"        "TaxType" NOT NULL,
    "name"        TEXT NOT NULL,
    "rate"        DECIMAL(7,4) NOT NULL,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TaxConfig"
    ADD CONSTRAINT "TaxConfig_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "TaxConfig_companyId_type_idx"   ON "TaxConfig"("companyId", "type");
CREATE INDEX "TaxConfig_companyId_isActive_idx" ON "TaxConfig"("companyId", "isActive");

-- TaxSuggestionRule: custom suggestion rules per company
CREATE TABLE "TaxSuggestionRule" (
    "id"                 TEXT NOT NULL,
    "companyId"          TEXT NOT NULL,
    "taxConfigId"        TEXT NOT NULL,
    "triggerCoaIds"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "triggerContactType" "ContactType",
    "triggerKeywords"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "minAmount"          DECIMAL(18,2),
    "priority"           INTEGER NOT NULL DEFAULT 0,
    "note"               TEXT,
    "isActive"           BOOLEAN NOT NULL DEFAULT true,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxSuggestionRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TaxSuggestionRule"
    ADD CONSTRAINT "TaxSuggestionRule_companyId_fkey"
        FOREIGN KEY ("companyId")  REFERENCES "Company"("id")   ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "TaxSuggestionRule_taxConfigId_fkey"
        FOREIGN KEY ("taxConfigId") REFERENCES "TaxConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "TaxSuggestionRule_companyId_idx"   ON "TaxSuggestionRule"("companyId");
CREATE INDEX "TaxSuggestionRule_taxConfigId_idx" ON "TaxSuggestionRule"("taxConfigId");

-- Asset: asset register (PSAK 16 tangible / PSAK 19 intangible)
CREATE TABLE "Asset" (
    "id"                       TEXT NOT NULL,
    "companyId"                TEXT NOT NULL,
    "assetCoaId"               TEXT NOT NULL,
    "accumulatedCoaId"         TEXT NOT NULL,
    "depreciationExpenseCoaId" TEXT NOT NULL,
    "assetType"                "AssetType" NOT NULL,
    "name"                     TEXT NOT NULL,
    "code"                     TEXT NOT NULL,
    "acquisitionDate"          TIMESTAMP(3) NOT NULL,
    "acquisitionCost"          DECIMAL(18,2) NOT NULL,
    "residualValue"            DECIMAL(18,2) NOT NULL DEFAULT 0,
    "usefulLifeMonths"         INTEGER NOT NULL,
    "depreciationMethod"       "DepreciationMethod" NOT NULL,
    "unitsTotal"               DECIMAL(18,4),
    "status"                   "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "disposalDate"             TIMESTAMP(3),
    "disposalAmount"           DECIMAL(18,2),
    "disposalCoaId"            TEXT,
    "notes"                    TEXT,
    "createdByUserId"          TEXT NOT NULL,
    "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey"              PRIMARY KEY ("id"),
    CONSTRAINT "Asset_companyId_code_key" UNIQUE ("companyId", "code")
);

ALTER TABLE "Asset"
    ADD CONSTRAINT "Asset_companyId_fkey"
        FOREIGN KEY ("companyId")                REFERENCES "Company"("id")        ON DELETE CASCADE  ON UPDATE CASCADE,
    ADD CONSTRAINT "Asset_assetCoaId_fkey"
        FOREIGN KEY ("assetCoaId")               REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Asset_accumulatedCoaId_fkey"
        FOREIGN KEY ("accumulatedCoaId")         REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Asset_depreciationExpenseCoaId_fkey"
        FOREIGN KEY ("depreciationExpenseCoaId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Asset_disposalCoaId_fkey"
        FOREIGN KEY ("disposalCoaId")            REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "Asset_createdByUserId_fkey"
        FOREIGN KEY ("createdByUserId")          REFERENCES "User"("id")           ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Asset_companyId_status_idx"    ON "Asset"("companyId", "status");
CREATE INDEX "Asset_companyId_assetType_idx" ON "Asset"("companyId", "assetType");

-- AssetDepreciation: per-period depreciation / amortisation journal records
CREATE TABLE "AssetDepreciation" (
    "id"                      TEXT NOT NULL,
    "assetId"                 TEXT NOT NULL,
    "companyId"               TEXT NOT NULL,
    "periodYear"              INTEGER NOT NULL,
    "periodMonth"             INTEGER NOT NULL,
    "depreciationAmount"      DECIMAL(18,2) NOT NULL,
    "accumulatedDepreciation" DECIMAL(18,2) NOT NULL,
    "bookValue"               DECIMAL(18,2) NOT NULL,
    "unitsProduced"           DECIMAL(18,4),
    "journalEntryId"          TEXT,
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetDepreciation_pkey"                              PRIMARY KEY ("id"),
    CONSTRAINT "AssetDepreciation_assetId_periodYear_periodMonth_key" UNIQUE ("assetId", "periodYear", "periodMonth"),
    CONSTRAINT "AssetDepreciation_journalEntryId_key"                UNIQUE ("journalEntryId")
);

ALTER TABLE "AssetDepreciation"
    ADD CONSTRAINT "AssetDepreciation_assetId_fkey"
        FOREIGN KEY ("assetId")        REFERENCES "Asset"("id")        ON DELETE CASCADE  ON UPDATE CASCADE,
    ADD CONSTRAINT "AssetDepreciation_journalEntryId_fkey"
        FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AssetDepreciation_companyId_periodYear_periodMonth_idx"
    ON "AssetDepreciation"("companyId", "periodYear", "periodMonth");

-- JournalEntryAttachment: file attachments for manual journal entries
CREATE TABLE "JournalEntryAttachment" (
    "id"               TEXT NOT NULL,
    "journalEntryId"   TEXT NOT NULL,
    "companyId"        TEXT NOT NULL,
    "fileName"         TEXT NOT NULL,
    "fileUrl"          TEXT NOT NULL,
    "fileSize"         INTEGER NOT NULL,
    "mimeType"         TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntryAttachment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "JournalEntryAttachment"
    ADD CONSTRAINT "JournalEntryAttachment_journalEntryId_fkey"
        FOREIGN KEY ("journalEntryId")   REFERENCES "JournalEntry"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
    ADD CONSTRAINT "JournalEntryAttachment_uploadedByUserId_fkey"
        FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id")         ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "JournalEntryAttachment_journalEntryId_idx" ON "JournalEntryAttachment"("journalEntryId");
CREATE INDEX "JournalEntryAttachment_companyId_idx"      ON "JournalEntryAttachment"("companyId");

-- ─── Step 6: Performance indexes on updated columns ──────────────────────────

CREATE INDEX "JournalEntry_companyId_status_idx" ON "JournalEntry"("companyId", "status");
CREATE INDEX "ChartOfAccount_companyId_subType_idx" ON "ChartOfAccount"("companyId", "subType");
