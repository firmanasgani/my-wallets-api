/*
  Warnings:

  - A unique constraint covering the columns `[inviteToken]` on the table `CompanyMember` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('CUSTOMER', 'VENDOR', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_INVOICE_CREATE';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_INVOICE_SENT';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_INVOICE_PAID';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_INVOICE_DELETED';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_CONTACT_CREATE';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_CONTACT_UPDATE';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_CONTACT_DELETE';

-- AlterTable
ALTER TABLE "ChartOfAccount" ADD COLUMN     "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CompanyMember" ADD COLUMN     "inviteToken" TEXT,
ADD COLUMN     "inviteTokenExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "ContactType" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "bankAccountHolder" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "clientAddress" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentDate" TIMESTAMP(3),
    "paymentCoaId" TEXT,
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceAttachment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessTransaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "debitCoaId" TEXT NOT NULL,
    "creditCoaId" TEXT NOT NULL,
    "contactId" TEXT,
    "invoiceId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_companyId_type_idx" ON "Contact"("companyId", "type");

-- CreateIndex
CREATE INDEX "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_invoiceNumber_key" ON "Invoice"("companyId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceAttachment_invoiceId_idx" ON "InvoiceAttachment"("invoiceId");

-- CreateIndex
CREATE INDEX "BusinessTransaction_companyId_transactionDate_idx" ON "BusinessTransaction"("companyId", "transactionDate");

-- CreateIndex
CREATE INDEX "BusinessTransaction_invoiceId_idx" ON "BusinessTransaction"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMember_inviteToken_key" ON "CompanyMember"("inviteToken");

-- CreateIndex
CREATE INDEX "CompanyMember_inviteToken_idx" ON "CompanyMember"("inviteToken");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAttachment" ADD CONSTRAINT "InvoiceAttachment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAttachment" ADD CONSTRAINT "InvoiceAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTransaction" ADD CONSTRAINT "BusinessTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTransaction" ADD CONSTRAINT "BusinessTransaction_debitCoaId_fkey" FOREIGN KEY ("debitCoaId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTransaction" ADD CONSTRAINT "BusinessTransaction_creditCoaId_fkey" FOREIGN KEY ("creditCoaId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTransaction" ADD CONSTRAINT "BusinessTransaction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTransaction" ADD CONSTRAINT "BusinessTransaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTransaction" ADD CONSTRAINT "BusinessTransaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
