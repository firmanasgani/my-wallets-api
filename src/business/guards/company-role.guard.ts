import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CompanyMemberRole } from '@prisma/client';
import { COMPANY_ROLE_KEY } from '../decorators/require-company-role.decorator';

/**
 * Role hierarchy (higher = more permissions).
 * Phase 8 adds CHECKER between STAFF and ADMIN.
 *
 * VIEWER   → read-only
 * STAFF    → create transactions, submit for review
 * CHECKER  → check (first approval gate) + everything STAFF can do
 * ADMIN    → approve + everything CHECKER can do, except delete company
 * OWNER    → full access
 */
const ROLE_HIERARCHY: Record<CompanyMemberRole, number> = {
  [CompanyMemberRole.VIEWER]:  0,
  [CompanyMemberRole.STAFF]:   1,
  [CompanyMemberRole.CHECKER]: 2,
  [CompanyMemberRole.ADMIN]:   3,
  [CompanyMemberRole.OWNER]:   4,
};

@Injectable()
export class CompanyRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<CompanyMemberRole[]>(
      COMPANY_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const member = request.companyMember;

    if (!member) throw new ForbiddenException('Company context not found.');

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
