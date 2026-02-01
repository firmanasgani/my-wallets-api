-- CreateEnum
CREATE TYPE "RecurringStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "RecurringTransaction" ADD COLUMN     "status" "RecurringStatus" NOT NULL DEFAULT 'ACTIVE';
