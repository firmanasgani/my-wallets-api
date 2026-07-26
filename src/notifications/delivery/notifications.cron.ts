import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationDeliveryStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationBroadcastsService } from 'src/admin/notification-broadcasts/notification-broadcasts.service';
import { FcmService } from './fcm.service';

const MAX_ATTEMPTS = 5;
const FCM_BATCH_SIZE = 500;

/**
 * The single shared cron for the notification system — one new file, two
 * unrelated jobs. Neither touches, extends, or runs alongside email-blast.cron.ts.
 * See NOTIFICATION_SYSTEM_PLAN.md §7.
 */
@Injectable()
export class NotificationsCron {
  private readonly logger = new Logger(NotificationsCron.name);

  constructor(
    private prisma: PrismaService,
    private fcmService: FcmService,
    private notificationBroadcastsService: NotificationBroadcastsService,
  ) {}

  /** Job 1: drains the FCM delivery queue (users only — admins never get mobile push). */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleFcmDelivery() {
    try {
      await this.drainFcmQueue();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed while draining FCM delivery queue: ${message}`);
    }
  }

  /** Job 2: sweeps SCHEDULED notification broadcasts whose time has come. */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleDueBroadcasts() {
    try {
      await this.notificationBroadcastsService.processDueScheduledBroadcasts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Failed while processing due notification broadcasts: ${message}`,
      );
    }
  }

  private async drainFcmQueue() {
    if (!this.fcmService.isEnabled) return;

    const pending = await this.prisma.userNotificationDelivery.findMany({
      where: {
        status: NotificationDeliveryStatus.PENDING,
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { createdAt: 'asc' },
      take: FCM_BATCH_SIZE,
      include: {
        deviceToken: { select: { id: true, token: true } },
        userNotification: { select: { title: true, body: true, type: true } },
      },
    });
    if (pending.length === 0) return;

    const results = await this.fcmService.sendBatch(
      pending.map((delivery) => ({
        token: delivery.deviceToken.token,
        title: delivery.userNotification.title,
        body: delivery.userNotification.body,
        data: { type: delivery.userNotification.type },
      })),
    );

    for (let i = 0; i < pending.length; i++) {
      const delivery = pending[i];
      const result = results[i];

      if (result.success) {
        await this.prisma.userNotificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: NotificationDeliveryStatus.SENT,
            sentAt: new Date(),
            attempts: { increment: 1 },
          },
        });
        continue;
      }

      const isInvalidToken = this.fcmService.isTokenInvalidError(
        result.errorCode,
      );
      const nextAttempts = delivery.attempts + 1;

      await this.prisma.userNotificationDelivery.update({
        where: { id: delivery.id },
        data: {
          // Invalid tokens fail immediately — no point retrying. Otherwise
          // retry (stay PENDING) until the 5th attempt, then give up.
          status:
            isInvalidToken || nextAttempts >= MAX_ATTEMPTS
              ? NotificationDeliveryStatus.FAILED
              : NotificationDeliveryStatus.PENDING,
          lastError: result.errorMessage?.slice(0, 500),
          attempts: nextAttempts,
        },
      });

      if (isInvalidToken) {
        await this.prisma.deviceToken.update({
          where: { id: delivery.deviceToken.id },
          data: { isActive: false },
        });
      }
    }
  }
}
