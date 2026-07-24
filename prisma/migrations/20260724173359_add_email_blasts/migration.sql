-- CreateEnum
CREATE TYPE "EmailBlastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailBlastRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LogActionType" ADD VALUE 'EMAIL_BLAST_CREATE';
ALTER TYPE "LogActionType" ADD VALUE 'EMAIL_BLAST_UPDATE';
ALTER TYPE "LogActionType" ADD VALUE 'EMAIL_BLAST_DELETE';
ALTER TYPE "LogActionType" ADD VALUE 'EMAIL_BLAST_SCHEDULE';
ALTER TYPE "LogActionType" ADD VALUE 'EMAIL_BLAST_CANCEL';
ALTER TYPE "LogActionType" ADD VALUE 'EMAIL_BLAST_SENT';
ALTER TYPE "LogActionType" ADD VALUE 'EMAIL_BLAST_FAILED';

-- CreateTable
CREATE TABLE "EmailBlast" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "EmailBlastStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailBlast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailBlastRecipient" (
    "id" TEXT NOT NULL,
    "emailBlastId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "EmailBlastRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "EmailBlastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailBlast_status_scheduledAt_idx" ON "EmailBlast"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "EmailBlastRecipient_emailBlastId_status_idx" ON "EmailBlastRecipient"("emailBlastId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailBlastRecipient_emailBlastId_userId_key" ON "EmailBlastRecipient"("emailBlastId", "userId");

-- AddForeignKey
ALTER TABLE "EmailBlast" ADD CONSTRAINT "EmailBlast_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailBlastRecipient" ADD CONSTRAINT "EmailBlastRecipient_emailBlastId_fkey" FOREIGN KEY ("emailBlastId") REFERENCES "EmailBlast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailBlastRecipient" ADD CONSTRAINT "EmailBlastRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
