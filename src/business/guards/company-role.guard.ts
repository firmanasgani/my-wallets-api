import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CompanyMemberRole } from '@prisma/client';
import { COMPANY_ROLE_KEY } from '../decorators/require-company-role.decorator';

const ROLE_HIERARCHY: Record<CompanyMemberRole, number> = {
  [CompanyMemberRole.VIEWER]: 0,
  [CompanyMemberRole.STAFF]: 1,
  [CompanyMemberRole.ADMIN]: 2,
  [CompanyMemberRole.OWNER]: 3,
};

@Injectable()
export class CompanyRoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<CompanyMemberRole[]>(
      COMPANY_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No role restriction set — allow access
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const member = request.companyMember;

    if (!member) {
      throw new ForbiddenException('Company context not found.');
    }

    const userLevel = ROLE_HIERARCHY[member.role as CompanyMemberRole];
    const minRequired = Math.min(...requiredRoles.map((r) => ROLE_HIERARCHY[r]));

    if (userLevel < minRequired) {
      throw new ForbiddenException(
        `Insufficient role. Required: ${requiredRoles.join(' or ')}.`,
      );
    }

    return true;
  }
}
