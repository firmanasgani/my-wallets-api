-- AlterEnum
ALTER TYPE "LogActionType" ADD VALUE 'PAYFEST_METHOD_TOGGLED';

-- CreateTable
CREATE TABLE "PayfestDisabledMethod" (
    "code" TEXT NOT NULL,
    "disabledByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayfestDisabledMethod_pkey" PRIMARY KEY ("code")
);

-- AddForeignKey
ALTER TABLE "PayfestDisabledMethod" ADD CONSTRAINT "PayfestDisabledMethod_disabledByAdminId_fkey" FOREIGN KEY ("disabledByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
