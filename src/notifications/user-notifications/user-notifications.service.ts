import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export interface CreateUserNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

@Injectable()
export class UserNotificationsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Single entry point for creating a user notification, used by every
   * transactional trigger (payment, chat, subscription) and by the
   * promotion broadcast cron alike, so delivery fan-out is written once.
   */
  async create(params: CreateUserNotificationParams) {
    const notification = await this.prisma.userNotification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data,
      },
    });

    // Web delivery: best-effort, in-process — no queue needed.
    this.eventEmitter.emit('user-notification.created', notification);

    // Mobile delivery: queue for the FCM drain cron, never call FCM inline.
    const activeTokens = await this.prisma.deviceToken.findMany({
      where: { userId: params.userId, isActive: true },
      select: { id: true },
    });
    if (activeTokens.length > 0) {
      await this.prisma.userNotificationDelivery.createMany({
        data: activeTokens.map((deviceToken) => ({
          userNotificationId: notification.id,
          deviceTokenId: deviceToken.id,
        })),
      });
    }

    return notification;
  }

  async list(
    userId: string,
    params: { page?: number; limit?: number; isRead?: boolean; type?: NotificationType },
  ) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserNotificationWhereInput = { userId };
    if (params.isRead !== undefined) where.isRead = params.isRead;
    if (params.type) where.type = params.type;

    const [data, total] = await Promise.all([
      this.prisma.userNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.userNotification.count({ where }),
    ]);

    return { data, meta: { total, page, limit, lastPage: Math.ceil(total / limit) } };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.userNotification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markRead(userId: string, id: string) {
    const result = await this.prisma.userNotification.updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Notification not found');
    }
    return { message: 'Notification marked as read' };
  }

  async markAllRead(userId: string) {
    await this.prisma.userNotification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { message: 'All notifications marked as read' };
  }
}
