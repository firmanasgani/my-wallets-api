-- AlterEnum
ALTER TYPE "LogActionType" ADD VALUE 'PAYFEST_CONFIG_UPDATE';

-- CreateTable
CREATE TABLE "PayfestConfig" (
    "id" TEXT NOT NULL DEFAULT 'payfest',
    "baseUrl" TEXT NOT NULL DEFAULT 'https://api-financial.firmanasgani.id',
    "accessKeyId" TEXT,
    "apiSecretEncrypted" TEXT,
    "webhookSecretEncrypted" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayfestConfig_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PayfestConfig" ADD CONSTRAINT "PayfestConfig_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
