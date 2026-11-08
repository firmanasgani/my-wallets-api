-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'PAYFEST';

-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN "payfestPaymentId" TEXT,
ADD COLUMN "payfestCheckout" JSONB,
ADD COLUMN "paymentMethodCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_payfestPaymentId_key" ON "PaymentTransaction"("payfestPaymentId");
