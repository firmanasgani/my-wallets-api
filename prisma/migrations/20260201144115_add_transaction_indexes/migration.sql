-- CreateIndex
CREATE INDEX "Transaction_userId_transactionType_transactionDate_idx" ON "Transaction"("userId", "transactionType", "transactionDate");

-- CreateIndex
CREATE INDEX "Transaction_userId_categoryId_idx" ON "Transaction"("userId", "categoryId");
