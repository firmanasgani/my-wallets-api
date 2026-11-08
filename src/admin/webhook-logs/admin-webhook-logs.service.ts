import { Injectable } from '@nestjs/common';
import { PayfestWebhookLogStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AdminWebhookLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    page?: number;
    limit?: number;
    status?: PayfestWebhookLogStatus;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 20;
    const skip = (page - 1) * limit;

    const where: { status?: PayfestWebhookLogStatus } = {};
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      this.prisma.payfestWebhookLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payfestWebhookLog.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, lastPage: Math.ceil(total / limit) || 1 },
    };
  }
}
