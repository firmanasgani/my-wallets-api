-- CreateEnum
CREATE TYPE "JournalLineType" AS ENUM ('DEBIT', 'CREDIT');

-- AlterEnum
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_JOURNAL_CREATE';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_JOURNAL_DELETE';

-- DropForeignKey
ALTER TABLE "BusinessTransaction" DROP CONSTRAINT "BusinessTransaction_companyId_fkey";

-- DropForeignKey
ALTER TABLE "BusinessTransaction" DROP CONSTRAINT "BusinessTransaction_debitCoaId_fkey";

-- DropForeignKey
ALTER TABLE "BusinessTransaction" DROP CONSTRAINT "BusinessTransaction_creditCoaId_fkey";

-- DropForeignKey
ALTER TABLE "BusinessTransaction" DROP CONSTRAINT "BusinessTransaction_contactId_fkey";

-- DropForeignKey
ALTER TABLE "BusinessTransaction" DROP CONSTRAINT "BusinessTransaction_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "BusinessTransaction" DROP CONSTRAINT "BusinessTransaction_createdByUserId_fkey";

-- DropTable
DROP TABLE "BusinessTransaction";

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "isSystemGenerated" BOOLEAN NOT NULL DEFAULT false,
    "invoiceId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "coaId" TEXT NOT NULL,
    "contactId" TEXT,
    "type" "JournalLineType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_transactionDate_idx" ON "JournalEntry"("companyId", "transactionDate");

-- CreateIndex
CREATE INDEX "JournalEntry_invoiceId_idx" ON "JournalEntry"("invoiceId");

-- CreateIndex
CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalLine_coaId_idx" ON "JournalLine"("coaId");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_coaId_fkey" FOREIGN KEY ("coaId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
