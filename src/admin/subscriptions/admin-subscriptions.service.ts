import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LogActionType, SubscriptionStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { LogsService } from 'src/logs/logs.service';

@Injectable()
export class AdminSubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private logsService: LogsService,
  ) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    status?: SubscriptionStatus;
    planId?: string;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserSubscriptionWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.planId) where.subscriptionPlanId = params.planId;

    const [data, total] = await Promise.all([
      this.prisma.userSubscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          plan: { select: { name: true, code: true } },
          user: { select: { id: true, username: true, email: true } },
        },
      }),
      this.prisma.userSubscription.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, lastPage: Math.ceil(total / limit) },
    };
  }

  async cancel(id: string, adminId: string, reason?: string) {
    const subscription = await this.prisma.userSubscription.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new BadRequestException('Only an active subscription can be cancelled');
    }

    const updated = await this.prisma.userSubscription.update({
      where: { id },
      data: { status: SubscriptionStatus.CANCELLED, endDate: new Date() },
    });

    await this.logsService.create({
      userId: subscription.userId,
      adminId,
      actionType: LogActionType.SUBSCRIPTION_CANCELLED_BY_ADMIN,
      entityType: 'UserSubscription',
      entityId: subscription.id,
      description: `Subscription to ${subscription.plan.name} cancelled by admin`,
      details: { reason },
    });

    return updated;
  }
}
