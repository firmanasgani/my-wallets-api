-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LogActionType" ADD VALUE 'SUBSCRIPTION_DOWNGRADE_SCHEDULED';
ALTER TYPE "LogActionType" ADD VALUE 'SUBSCRIPTION_DOWNGRADE_CANCELLED';

-- AlterTable
ALTER TABLE "UserSubscription" ADD COLUMN     "scheduledPlanId" TEXT;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_scheduledPlanId_fkey" FOREIGN KEY ("scheduledPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
