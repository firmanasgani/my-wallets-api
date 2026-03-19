import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyMemberStatus, SubscriptionStatus } from '@prisma/client';

const BUSINESS_PLAN_CODES = ['BUSINESS_1M', 'BUSINESS_6M', 'BUSINESS_12M'];

@Injectable()
export class BusinessSubscriptionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Pass 1: user has their own active Business subscription (OWNER)
    const ownSub = await this.prisma.userSubscription.findFirst({
      where: {
        userId: user.id,
        status: SubscriptionStatus.ACTIVE,
        plan: { code: { in: BUSINESS_PLAN_CODES } },
      },
    });

    if (ownSub) return true;

    // Pass 2: user is an active member of a company whose OWNER has an active Business subscription
    const membership = await this.prisma.companyMember.findFirst({
      where: {
        userId: user.id,
        status: CompanyMemberStatus.ACTIVE,
        company: {
          owner: {
            subscriptions: {
              some: {
                status: SubscriptionStatus.ACTIVE,
                plan: { code: { in: BUSINESS_PLAN_CODES } },
              },
            },
          },
        },
      },
    });

    if (membership) return true;

    throw new ForbiddenException(
      'Active Business subscription is required to access this feature.',
    );
  }
}
