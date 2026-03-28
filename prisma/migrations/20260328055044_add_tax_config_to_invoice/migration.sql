-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "taxConfigId" TEXT;

-- AlterTable
ALTER TABLE "TaxSuggestionRule" ALTER COLUMN "triggerCoaIds" DROP DEFAULT,
ALTER COLUMN "triggerKeywords" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_taxConfigId_fkey" FOREIGN KEY ("taxConfigId") REFERENCES "TaxConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
