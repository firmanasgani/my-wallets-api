import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  LogActionType,
  NotificationBroadcastRecipientStatus,
  NotificationBroadcastStatus,
  NotificationBroadcastTargetType,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { LogsService } from 'src/logs/logs.service';
import { UserNotificationsService } from 'src/notifications/user-notifications/user-notifications.service';
import { CreateNotificationBroadcastDto } from './dto/create-notification-broadcast.dto';
import { UpdateNotificationBroadcastDto } from './dto/update-notification-broadcast.dto';

const EDITABLE_STATUSES: NotificationBroadcastStatus[] = [
  NotificationBroadcastStatus.DRAFT,
  NotificationBroadcastStatus.SCHEDULED,
];

/**
 * Admin-authored promotional pushes. Structurally similar to EmailBlast
 * (queue table + atomic claim + minute cron) but fully independent of it —
 * see NOTIFICATION_SYSTEM_PLAN.md §2/§6. Sends land as UserNotification rows
 * (bell + socket + FCM) via UserNotificationsService, never as email.
 */
@Injectable()
export class NotificationBroadcastsService {
  private readonly logger = new Logger(NotificationBroadcastsService.name);

  constructor(
    private prisma: PrismaService,
    private logsService: LogsService,
    private userNotificationsService: UserNotificationsService,
  ) {}

  findAll() {
    return this.prisma.notificationBroadcast.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, username: true } } },
    });
  }

  async findOne(id: string) {
    const broadcast = await this.prisma.notificationBroadcast.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, username: true } },
        recipients: {
          select: { id: true, userId: true, status: true, sentAt: true, error: true },
        },
      },
    });
    if (!broadcast) throw new NotFoundException('Notification broadcast not found');
    return broadcast;
  }

  async create(dto: CreateNotificationBroadcastDto, adminId: string) {
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;
    const status = scheduledAt
      ? NotificationBroadcastStatus.SCHEDULED
      : NotificationBroadcastStatus.DRAFT;

    let totalRecipients = 0;
    let recipientsCreate: { userId: string }[] = [];

    if (dto.targetType === NotificationBroadcastTargetType.SPECIFIC_USERS) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: dto.userIds } },
        select: { id: true },
      });
      if (users.length === 0) {
        throw new BadRequestException('No valid recipients found.');
      }
      totalRecipients = users.length;
      recipientsCreate = users.map((user) => ({ userId: user.id }));
    }
    // ALL_USERS: no recipient rows yet — resolved at send time (resolveAllUsersRecipients).

    const broadcast = await this.prisma.notificationBroadcast.create({
      data: {
        title: dto.title,
        body: dto.body,
        targetType: dto.targetType,
        status,
        scheduledAt,
        totalRecipients,
        createdByAdminId: adminId,
        recipients:
          recipientsCreate.length > 0 ? { create: recipientsCreate } : undefined,
      },
      include: { recipients: true },
    });

    await this.logsService.create({
      adminId,
      actionType:
        status === NotificationBroadcastStatus.SCHEDULED
          ? LogActionType.NOTIFICATION_BROADCAST_SCHEDULE
          : LogActionType.NOTIFICATION_BROADCAST_CREATE,
      entityType: 'NotificationBroadcast',
      entityId: broadcast.id,
      description: `Notification broadcast "${broadcast.title}" created (${
        dto.targetType === NotificationBroadcastTargetType.ALL_USERS
          ? 'all active users'
          : `${totalRecipients} recipient(s)`
      })`,
      details: { targetType: dto.targetType, scheduledAt: dto.scheduledAt ?? null },
    });

    return broadcast;
  }

  async update(id: string, dto: UpdateNotificationBroadcastDto, adminId: string) {
    const existing = await this.prisma.notificationBroadcast.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Notification broadcast not found');
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException('Only draft or scheduled broadcasts can be edited.');
    }

    let totalRecipients = existing.totalRecipients;
    if (dto.userIds) {
      if (existing.targetType !== NotificationBroadcastTargetType.SPECIFIC_USERS) {
        throw new BadRequestException(
          'Recipient list can only be edited for SPECIFIC_USERS broadcasts.',
        );
      }
      const users = await this.prisma.user.findMany({
        where: { id: { in: dto.userIds } },
        select: { id: true },
      });
      if (users.length === 0) {
        throw new BadRequestException('No valid recipients found.');
      }
      await this.prisma.notificationBroadcastRecipient.deleteMany({
        where: { notificationBroadcastId: id },
      });
      await this.prisma.notificationBroadcastRecipient.createMany({
        data: users.map((user) => ({ notificationBroadcastId: id, userId: user.id })),
      });
      totalRecipients = users.length;
    }

    let status = existing.status;
    let scheduledAt = existing.scheduledAt;
    if (dto.scheduledAt === null) {
      status = NotificationBroadcastStatus.DRAFT;
      scheduledAt = null;
    } else if (dto.scheduledAt) {
      status = NotificationBroadcastStatus.SCHEDULED;
      scheduledAt = new Date(dto.scheduledAt);
    }

    const updated = await this.prisma.notificationBroadcast.update({
      where: { id },
      data: { title: dto.title, body: dto.body, status, scheduledAt, totalRecipients },
      include: { recipients: true },
    });

    await this.logsService.create({
      adminId,
      actionType: LogActionType.NOTIFICATION_BROADCAST_UPDATE,
      entityType: 'NotificationBroadcast',
      entityId: id,
      description: `Notification broadcast "${updated.title}" updated`,
    });

    return updated;
  }

  async unschedule(id: string, adminId: string) {
    const existing = await this.prisma.notificationBroadcast.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Notification broadcast not found');
    if (existing.status !== NotificationBroadcastStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled broadcasts can be unscheduled.');
    }

    const updated = await this.prisma.notificationBroadcast.update({
      where: { id },
      data: { status: NotificationBroadcastStatus.DRAFT, scheduledAt: null },
    });

    await this.logsService.create({
      adminId,
      actionType: LogActionType.NOTIFICATION_BROADCAST_CANCEL,
      entityType: 'NotificationBroadcast',
      entityId: id,
      description: `Notification broadcast "${updated.title}" unscheduled`,
    });

    return updated;
  }

  async remove(id: string, adminId: string) {
    const existing = await this.prisma.notificationBroadcast.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Notification broadcast not found');
    if (existing.status === NotificationBroadcastStatus.SENDING) {
      throw new BadRequestException('Cannot delete a broadcast while it is sending.');
    }

    await this.prisma.notificationBroadcast.delete({ where: { id } });

    await this.logsService.create({
      adminId,
      actionType: LogActionType.NOTIFICATION_BROADCAST_DELETE,
      entityType: 'NotificationBroadcast',
      entityId: id,
      description: `Notification broadcast "${existing.title}" deleted`,
    });

    return { message: 'Notification broadcast deleted' };
  }

  async sendNow(id: string) {
    const existing = await this.prisma.notificationBroadcast.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Notification broadcast not found');
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException('Only draft or scheduled broadcasts can be sent.');
    }

    // Fire-and-forget: sendBroadcast() claims the row atomically, so the cron
    // sweeping scheduled broadcasts can never double-send this one.
    void this.sendBroadcast(id).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to send broadcast ${id}: ${message}`);
    });

    return { message: 'Sending started' };
  }

  /** Sweeps for SCHEDULED broadcasts whose time has come; called by the shared notifications cron (job 2). DRAFT broadcasts never auto-send. */
  async processDueScheduledBroadcasts() {
    const due = await this.prisma.notificationBroadcast.findMany({
      where: {
        status: NotificationBroadcastStatus.SCHEDULED,
        scheduledAt: { lte: new Date() },
      },
      select: { id: true },
    });

    for (const broadcast of due) {
      await this.sendBroadcast(broadcast.id);
    }
  }

  private async sendBroadcast(id: string) {
    // Atomic claim: only one caller (cron or manual send-now) gets to move
    // this broadcast into SENDING, so it can never be processed twice.
    const claimed = await this.prisma.notificationBroadcast.updateMany({
      where: { id, status: { in: EDITABLE_STATUSES } },
      data: { status: NotificationBroadcastStatus.SENDING },
    });
    if (claimed.count === 0) return;

    let broadcast = await this.prisma.notificationBroadcast.findUnique({ where: { id } });
    if (!broadcast) return;

    if (broadcast.targetType === NotificationBroadcastTargetType.ALL_USERS) {
      // Resolved here, not at create() time, so a scheduled broadcast reflects
      // who's active when it actually sends — see NOTIFICATION_SYSTEM_PLAN.md §6.
      await this.resolveAllUsersRecipients(id);
      broadcast = await this.prisma.notificationBroadcast.findUnique({ where: { id } });
      if (!broadcast) return;
    }

    const pendingRecipients = await this.prisma.notificationBroadcastRecipient.findMany({
      where: { notificationBroadcastId: id, status: NotificationBroadcastRecipientStatus.PENDING },
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of pendingRecipients) {
      try {
        const notification = await this.userNotificationsService.create({
          userId: recipient.userId,
          type: NotificationType.PROMOTION,
          title: broadcast.title,
          body: broadcast.body,
          data: (broadcast.data ?? undefined) as Prisma.InputJsonValue | undefined,
        });
        sentCount++;
        await this.prisma.notificationBroadcastRecipient.update({
          where: { id: recipient.id },
          data: {
            status: NotificationBroadcastRecipientStatus.SENT,
            sentAt: new Date(),
            userNotificationId: notification.id,
          },
        });
      } catch (err) {
        failedCount++;
        const message = err instanceof Error ? err.message : 'Unknown error';
        await this.prisma.notificationBroadcastRecipient.update({
          where: { id: recipient.id },
          data: { status: NotificationBroadcastRecipientStatus.FAILED, error: message.slice(0, 500) },
        });
      }
    }

    const finalStatus =
      failedCount > 0 && sentCount === 0
        ? NotificationBroadcastStatus.FAILED
        : NotificationBroadcastStatus.SENT;

    await this.prisma.notificationBroadcast.update({
      where: { id },
      data: {
        status: finalStatus,
        sentAt: new Date(),
        sentCount: { increment: sentCount },
        failedCount: { increment: failedCount },
        errorMessage:
          finalStatus === NotificationBroadcastStatus.FAILED
            ? 'All recipients failed to send.'
            : null,
      },
    });

    await this.logsService.create({
      adminId: broadcast.createdByAdminId,
      actionType:
        finalStatus === NotificationBroadcastStatus.SENT
          ? LogActionType.NOTIFICATION_BROADCAST_SENT
          : LogActionType.NOTIFICATION_BROADCAST_FAILED,
      entityType: 'NotificationBroadcast',
      entityId: id,
      description: `Notification broadcast "${broadcast.title}" ${
        finalStatus === NotificationBroadcastStatus.SENT ? 'sent' : 'failed'
      } (${sentCount} sent, ${failedCount} failed)`,
    });
  }

  private async resolveAllUsersRecipients(broadcastId: string) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    if (users.length > 0) {
      await this.prisma.notificationBroadcastRecipient.createMany({
        data: users.map((user) => ({ notificationBroadcastId: broadcastId, userId: user.id })),
        skipDuplicates: true,
      });
    }

    await this.prisma.notificationBroadcast.update({
      where: { id: broadcastId },
      data: { totalRecipients: users.length },
    });
  }
}
