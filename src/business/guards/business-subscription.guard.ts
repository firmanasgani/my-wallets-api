import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';

const BUSINESS_PLAN_CODES = ['BUSINESS_1M', 'BUSINESS_6M', 'BUSINESS_12M'];

@Injectable()
export class BusinessSubscriptionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const activeSub = await this.prisma.userSubscription.findFirst({
      where: {
        userId: user.id,
        status: SubscriptionStatus.ACTIVE,
        plan: { code: { in: BUSINESS_PLAN_CODES } },
      },
      include: { plan: { select: { code: true } } },
    });

    if (!activeSub) {
      throw new ForbiddenException(
        'Active Business subscription is required to access this feature.',
      );
    }

    return true;
  }
}
