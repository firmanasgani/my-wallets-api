import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLogDto } from './dto/create-log.dto';
import { Log, LogActionType, Prisma } from '@prisma/client';

@Injectable()
export class LogsService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateLogDto): Promise<Log | null> {
    try {
      const logData: Prisma.LogCreateInput = {
        actionType: data.actionType,
        entityType: data.entityType,
        entityId: data.entityId,
        description: data.description,
        details: data.details ?? Prisma.JsonNull,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      };

      if (data.userId) logData.user = { connect: { id: data.userId } };

      return await this.prisma.log.create({
        data: logData,
      });
    } catch (error) {
      Logger.log('Failed to create log entry', {
        errorMessage: error.message,
        dto: data,
        stack: error.stack,
      });

      return null;
    }
  }

  async findUserlogs(
    userId: string,
    page: number = 1,
    limit: number = 10,
    actionType?: LogActionType,
  ) {
    const skip = (page - 1) * limit;
    const whereClause: Prisma.LogWhereInput = { userId };
    if (actionType) {
      whereClause.actionType = actionType;
    }

    const logs = await this.prisma.log.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { user: { select: { id: true, username: true } } },
    });

    const total = await this.prisma.log.count({ where: whereClause });
    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async findAllLogs(
    page: number = 1,
    limit: number = 10,
    actionType?: LogActionType,
  ) {
    const skip = (page - 1) * limit;
    const whereClause: Prisma.LogWhereInput = {};
    if (actionType) {
      whereClause.actionType = actionType;
    }

    const logs = await this.prisma.log.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { user: { select: { id: true, username: true } } },
    });
    const total = await this.prisma.log.count({ where: whereClause });
    return {
      data: logs,
      meta: { total, page, limit, lastPage: Math.ceil(total / limit) },
    };
  }
}
