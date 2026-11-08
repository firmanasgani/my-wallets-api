-- CreateEnum
CREATE TYPE "PayfestWebhookLogStatus" AS ENUM ('PROCESSED', 'IGNORED', 'INVALID_SIGNATURE', 'UNKNOWN_PAYMENT', 'ERROR');

-- CreateTable
CREATE TABLE "PayfestWebhookLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "eventType" TEXT,
    "orderId" TEXT,
    "paymentId" TEXT,
    "status" "PayfestWebhookLogStatus" NOT NULL,
    "payload" JSONB NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayfestWebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayfestWebhookLog_createdAt_idx" ON "PayfestWebhookLog"("createdAt");

-- CreateIndex
CREATE INDEX "PayfestWebhookLog_orderId_idx" ON "PayfestWebhookLog"("orderId");
