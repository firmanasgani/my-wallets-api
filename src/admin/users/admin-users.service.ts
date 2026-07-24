import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { LogActionType, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { LogsService } from 'src/logs/logs.service';

@Injectable()
export class AdminUsersService {
  constructor(
    private prisma: PrismaService,
    private logsService: LogsService,
  ) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    segment?: 'active_subscribers' | 'free';
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};
    if (params.isActive !== undefined) where.isActive = params.isActive;
    if (params.search) {
      where.OR = [
        { username: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { fullName: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.segment === 'active_subscribers') {
      where.subscriptions = { some: { status: 'ACTIVE' } };
    } else if (params.segment === 'free') {
      where.subscriptions = { none: { status: 'ACTIVE' } };
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          email: true,
          fullName: true,
          isActive: true,
          deactivatedAt: true,
          deactivatedReason: true,
          createdAt: true,
          subscriptions: {
            where: { status: 'ACTIVE' },
            take: 1,
            include: { plan: { select: { name: true, code: true } } },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, lastPage: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        isActive: true,
        deactivatedAt: true,
        deactivatedReason: true,
        createdAt: true,
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          include: { plan: true },
        },
        paymentTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async deactivate(id: string, actingAdminId: string, reason?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.isActive) {
      throw new BadRequestException('User is already deactivated');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedReason: reason ?? null,
      },
    });

    await this.logsService.create({
      userId: id,
      adminId: actingAdminId,
      actionType: LogActionType.USER_DEACTIVATED_BY_ADMIN,
      entityType: 'User',
      entityId: id,
      description: `User ${user.username} deactivated by admin`,
      details: { reason },
    });

    const { passwordHash, ...rest } = updated;
    return rest;
  }

  async activate(id: string, actingAdminId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: true, deactivatedAt: null, deactivatedReason: null },
    });

    await this.logsService.create({
      userId: id,
      adminId: actingAdminId,
      actionType: LogActionType.USER_ACTIVATED_BY_ADMIN,
      entityType: 'User',
      entityId: id,
      description: `User ${user.username} reactivated by admin`,
    });

    const { passwordHash, ...rest } = updated;
    return rest;
  }

  async resetPassword(id: string, actingAdminId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: newPasswordHash,
        // An admin-set password supersedes any in-flight self-service reset.
        resetPasswordOtp: null,
        resetPasswordOtpExpires: null,
        resetPasswordToken: null,
        resetPasswordTokenExpires: null,
      },
    });

    await this.logsService.create({
      userId: id,
      adminId: actingAdminId,
      actionType: LogActionType.USER_PASSWORD_RESET_BY_ADMIN,
      entityType: 'User',
      entityId: id,
      description: `Password reset for ${user.username} by admin`,
    });

    const { passwordHash, ...rest } = updated;
    return rest;
  }
}
