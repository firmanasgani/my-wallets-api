import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export interface FanOutToAdminsParams {
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

@Injectable()
export class AdminNotificationsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Fan-out model: one row per active admin (same shape as EmailBlastRecipient),
   * so each admin gets independent read state. Web-only — no FCM/device tokens
   * for admins, so no delivery queue involved, just the socket emit.
   */
  async fanOutToAllActiveAdmins(params: FanOutToAdminsParams) {
    const admins = await this.prisma.admin.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    if (admins.length === 0) return [];

    const notifications = await Promise.all(
      admins.map((admin) =>
        this.prisma.adminNotification.create({
          data: {
            adminId: admin.id,
            type: params.type,
            title: params.title,
            body: params.body,
            data: params.data,
          },
        }),
      ),
    );

    for (const notification of notifications) {
      this.eventEmitter.emit('admin-notification.created', notification);
    }

    return notifications;
  }

  async list(
    adminId: string,
    params: {
      page?: number;
      limit?: number;
      isRead?: boolean;
      type?: NotificationType;
    },
  ) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AdminNotificationWhereInput = { adminId };
    if (params.isRead !== undefined) where.isRead = params.isRead;
    if (params.type) where.type = params.type;

    const [data, total] = await Promise.all([
      this.prisma.adminNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.adminNotification.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, lastPage: Math.ceil(total / limit) },
    };
  }

  async unreadCount(adminId: string) {
    const count = await this.prisma.adminNotification.count({
      where: { adminId, isRead: false },
    });
    return { count };
  }

  async markRead(adminId: string, id: string) {
    const result = await this.prisma.adminNotification.updateMany({
      where: { id, adminId },
      data: { isRead: true, readAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Notification not found');
    }
    return { message: 'Notification marked as read' };
  }

  async markAllRead(adminId: string) {
    await this.prisma.adminNotification.updateMany({
      where: { adminId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { message: 'All notifications marked as read' };
  }
}
