import { Injectable } from '@nestjs/common';
import {
  AdminRole,
  ConversationStatus,
  EmailBlastStatus,
  MessageSenderType,
  PaymentStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  /**
   * AGENT gets support-desk context only (their permissions are read-only
   * outside of chat). SALES gets the revenue/growth/marketing picture (what
   * they can act on). SUPERADMIN gets everything, plus admin-team oversight.
   * `from`/`to` scope the trend-shaped fields (new signups, revenue); the
   * rest of the payload is a current-state snapshot regardless of range.
   */
  async getDashboard(role: AdminRole, adminId: string, from: Date, to: Date) {
    if (role === AdminRole.SUPERADMIN) {
      const [
        chat,
        users,
        payments,
        subscriptions,
        emailBlasts,
        announcements,
        admins,
        recentActivity,
      ] = await Promise.all([
        this.getChatStats(),
        this.getUserStats(from, to),
        this.getPaymentStats(from, to),
        this.getSubscriptionStats(),
        this.getEmailBlastStats(),
        this.getAnnouncementStats(),
        this.getAdminStats(),
        this.getRecentActivity(),
      ]);
      return {
        role,
        chat,
        users,
        payments,
        subscriptions,
        emailBlasts,
        announcements,
        admins,
        recentActivity,
      };
    }

    if (role === AdminRole.SALES) {
      const [chat, users, payments, subscriptions, emailBlasts, announcements] =
        await Promise.all([
          this.getChatStats(),
          this.getUserStats(from, to),
          this.getPaymentStats(from, to),
          this.getSubscriptionStats(),
          this.getEmailBlastStats(),
          this.getAnnouncementStats(),
        ]);
      return {
        role,
        chat,
        users,
        payments,
        subscriptions,
        emailBlasts,
        announcements,
      };
    }

    // AGENT: chat is their job; a light read-only user snapshot for context.
    const [chat, users] = await Promise.all([
      this.getChatStats(),
      this.getUserStats(from, to),
    ]);
    return {
      role,
      chat,
      users,
      assignedToMe: await this.getAssignedConversationCount(adminId),
    };
  }

  private async getChatStats() {
    const [openConversations, totalConversations, unreadConversations] =
      await Promise.all([
        this.prisma.conversation.count({
          where: { status: ConversationStatus.OPEN },
        }),
        this.prisma.conversation.count(),
        this.prisma.conversation.count({
          where: {
            messages: {
              some: { senderType: MessageSenderType.USER, isRead: false },
            },
          },
        }),
      ]);
    return { openConversations, totalConversations, unreadConversations };
  }

  private getAssignedConversationCount(adminId: string) {
    return this.prisma.conversation.count({
      where: { assignedAdminId: adminId, status: ConversationStatus.OPEN },
    });
  }

  private async getUserStats(from: Date, to: Date) {
    const [total, activeCount, paidCount, usersInRange] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({
        where: {
          subscriptions: { some: { status: SubscriptionStatus.ACTIVE } },
        },
      }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
    ]);

    return {
      total,
      activeCount,
      paidCount,
      freeCount: total - paidCount,
      newInRange: usersInRange.length,
      dailySignups: this.bucketCountsByDay(usersInRange, from, to),
    };
  }

  private async getPaymentStats(from: Date, to: Date) {
    const [
      pendingReviewCount,
      totalRevenue,
      successCount,
      failedCount,
      paymentsInRange,
    ] = await Promise.all([
      this.prisma.paymentTransaction.count({
        where: { status: PaymentStatus.PENDING_REVIEW },
      }),
      this.prisma.paymentTransaction.aggregate({
        where: { status: PaymentStatus.SUCCESS },
        _sum: { amount: true },
      }),
      this.prisma.paymentTransaction.count({
        where: { status: PaymentStatus.SUCCESS },
      }),
      this.prisma.paymentTransaction.count({
        where: { status: PaymentStatus.FAILED },
      }),
      this.prisma.paymentTransaction.findMany({
        where: {
          status: PaymentStatus.SUCCESS,
          createdAt: { gte: from, lte: to },
        },
        select: { createdAt: true, amount: true },
      }),
    ]);

    const revenueInRange = paymentsInRange.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );

    return {
      pendingReviewCount,
      totalRevenue: (totalRevenue._sum.amount ?? 0).toString(),
      successCount,
      failedCount,
      revenueInRange: revenueInRange.toString(),
      dailyRevenue: this.bucketAmountsByDay(paymentsInRange, from, to),
    };
  }

  private async getSubscriptionStats() {
    const now = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const [activeCount, expiringSoonCount, planPopularity] = await Promise.all([
      this.prisma.userSubscription.count({
        where: { status: SubscriptionStatus.ACTIVE },
      }),
      this.prisma.userSubscription.count({
        where: {
          status: SubscriptionStatus.ACTIVE,
          endDate: { gte: now, lte: sevenDaysFromNow },
        },
      }),
      this.prisma.userSubscription.groupBy({
        by: ['subscriptionPlanId'],
        where: { status: SubscriptionStatus.ACTIVE },
        _count: true,
      }),
    ]);

    const plans = await this.prisma.subscriptionPlan.findMany({
      where: {
        id: { in: planPopularity.map((row) => row.subscriptionPlanId) },
      },
      select: { id: true, name: true },
    });
    const planNameById = new Map(plans.map((plan) => [plan.id, plan.name]));

    return {
      activeCount,
      expiringSoonCount,
      planPopularity: planPopularity
        .map((row) => ({
          planName: planNameById.get(row.subscriptionPlanId) ?? 'Unknown',
          count: row._count,
        }))
        .sort((a, b) => b.count - a.count),
    };
  }

  private async getEmailBlastStats() {
    const [scheduledUpcoming, recentSent] = await Promise.all([
      this.prisma.emailBlast.findMany({
        where: { status: EmailBlastStatus.SCHEDULED },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        select: {
          id: true,
          subject: true,
          scheduledAt: true,
          totalRecipients: true,
        },
      }),
      this.prisma.emailBlast.findMany({
        where: {
          status: { in: [EmailBlastStatus.SENT, EmailBlastStatus.FAILED] },
        },
        orderBy: { sentAt: 'desc' },
        take: 5,
        select: {
          id: true,
          subject: true,
          sentCount: true,
          failedCount: true,
          sentAt: true,
        },
      }),
    ]);
    return { scheduledUpcoming, recentSent };
  }

  private async getAnnouncementStats() {
    const now = new Date();
    const activeCount = await this.prisma.announcement.count({
      where: {
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
    });
    return { activeCount };
  }

  private async getAdminStats() {
    const byRoleRaw = await this.prisma.admin.groupBy({
      by: ['role'],
      _count: true,
    });
    const total = byRoleRaw.reduce((sum, row) => sum + row._count, 0);
    return {
      total,
      byRole: byRoleRaw.map((row) => ({ role: row.role, count: row._count })),
    };
  }

  private async getRecentActivity() {
    const logs = await this.prisma.log.findMany({
      where: { adminId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { admin: { select: { username: true } } },
    });
    return logs.map((log) => ({
      id: log.id,
      actionType: log.actionType,
      description: log.description,
      createdAt: log.createdAt,
      admin: log.admin ? { username: log.admin.username } : null,
    }));
  }

  /** Every day in [from, to] as 'YYYY-MM-DD', so the trend chart has no gaps. */
  private buildDayBuckets(from: Date, to: Date): string[] {
    const days: string[] = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      days.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  private bucketCountsByDay(rows: { createdAt: Date }[], from: Date, to: Date) {
    const days = this.buildDayBuckets(from, to);
    const counts = new Map(days.map((day) => [day, 0]));
    for (const row of rows) {
      const key = row.createdAt.toISOString().slice(0, 10);
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return days.map((date) => ({ date, count: counts.get(date) ?? 0 }));
  }

  private bucketAmountsByDay(
    rows: { createdAt: Date; amount: { toString(): string } }[],
    from: Date,
    to: Date,
  ) {
    const days = this.buildDayBuckets(from, to);
    const sums = new Map(days.map((day) => [day, 0]));
    for (const row of rows) {
      const key = row.createdAt.toISOString().slice(0, 10);
      if (sums.has(key))
        sums.set(key, (sums.get(key) ?? 0) + Number(row.amount));
    }
    return days.map((date) => ({ date, amount: sums.get(date) ?? 0 }));
  }
}
