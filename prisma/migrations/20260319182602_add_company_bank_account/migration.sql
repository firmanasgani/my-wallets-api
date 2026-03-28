-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "paymentBankAccountId" TEXT;

-- CreateTable
CREATE TABLE "CompanyBankAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyBankAccount_companyId_idx" ON "CompanyBankAccount"("companyId");

-- AddForeignKey
ALTER TABLE "CompanyBankAccount" ADD CONSTRAINT "CompanyBankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentBankAccountId_fkey" FOREIGN KEY ("paymentBankAccountId") REFERENCES "CompanyBankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
