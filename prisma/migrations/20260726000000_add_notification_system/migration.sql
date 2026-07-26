-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'PAYMENT_PENDING_REVIEW', 'SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_EXPIRING', 'SUBSCRIPTION_EXPIRED', 'SUBSCRIPTION_CANCELLED', 'CHAT_MESSAGE', 'ACCOUNT_STATUS', 'PROMOTION', 'USER_REGISTERED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationBroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationBroadcastTargetType" AS ENUM ('ALL_USERS', 'SPECIFIC_USERS');

-- CreateEnum
CREATE TYPE "NotificationBroadcastRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LogActionType" ADD VALUE 'NOTIFICATION_BROADCAST_CREATE';
ALTER TYPE "LogActionType" ADD VALUE 'NOTIFICATION_BROADCAST_UPDATE';
ALTER TYPE "LogActionType" ADD VALUE 'NOTIFICATION_BROADCAST_DELETE';
ALTER TYPE "LogActionType" ADD VALUE 'NOTIFICATION_BROADCAST_SCHEDULE';
ALTER TYPE "LogActionType" ADD VALUE 'NOTIFICATION_BROADCAST_CANCEL';
ALTER TYPE "LogActionType" ADD VALUE 'NOTIFICATION_BROADCAST_SENT';
ALTER TYPE "LogActionType" ADD VALUE 'NOTIFICATION_BROADCAST_FAILED';

-- CreateTable
CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "token" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotificationDelivery" (
    "id" TEXT NOT NULL,
    "userNotificationId" TEXT NOT NULL,
    "deviceTokenId" TEXT NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminNotification" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationBroadcast" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "targetType" "NotificationBroadcastTargetType" NOT NULL,
    "status" "NotificationBroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationBroadcastRecipient" (
    "id" TEXT NOT NULL,
    "notificationBroadcastId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userNotificationId" TEXT,
    "status" "NotificationBroadcastRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "NotificationBroadcastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserNotification_userId_isRead_createdAt_idx" ON "UserNotification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_isActive_idx" ON "DeviceToken"("userId", "isActive");

-- CreateIndex
CREATE INDEX "UserNotificationDelivery_status_createdAt_idx" ON "UserNotificationDelivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AdminNotification_adminId_isRead_createdAt_idx" ON "AdminNotification"("adminId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationBroadcastRecipient_notificationBroadcastId_status_idx" ON "NotificationBroadcastRecipient"("notificationBroadcastId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationBroadcastRecipient_notificationBroadcastId_userId_key" ON "NotificationBroadcastRecipient"("notificationBroadcastId", "userId");

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationDelivery" ADD CONSTRAINT "UserNotificationDelivery_userNotificationId_fkey" FOREIGN KEY ("userNotificationId") REFERENCES "UserNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationDelivery" ADD CONSTRAINT "UserNotificationDelivery_deviceTokenId_fkey" FOREIGN KEY ("deviceTokenId") REFERENCES "DeviceToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminNotification" ADD CONSTRAINT "AdminNotification_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationBroadcast" ADD CONSTRAINT "NotificationBroadcast_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationBroadcastRecipient" ADD CONSTRAINT "NotificationBroadcastRecipient_notificationBroadcastId_fkey" FOREIGN KEY ("notificationBroadcastId") REFERENCES "NotificationBroadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationBroadcastRecipient" ADD CONSTRAINT "NotificationBroadcastRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
