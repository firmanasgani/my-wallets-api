-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "withholdingTaxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;
