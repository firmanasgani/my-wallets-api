import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyMemberStatus } from '@prisma/client';

@Injectable()
export class CompanyMemberGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const member = await this.prisma.companyMember.findFirst({
      where: {
        userId: user.id,
        status: CompanyMemberStatus.ACTIVE,
      },
      include: { company: true },
    });

    if (!member) {
      throw new NotFoundException(
        'You are not a member of any company. Please create or join a company first.',
      );
    }

    // Attach company and member role to request for downstream use
    request.company = member.company;
    request.companyMember = member;

    return true;
  }
}
