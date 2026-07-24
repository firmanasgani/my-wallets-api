import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@prisma/client';
import { ADMIN_ROLE_KEY } from '../decorators/require-admin-role.decorator';

/**
 * SUPERADMIN, SALES and AGENT are peers with different responsibilities
 * (not an ordered hierarchy), so this is a plain set-membership check.
 * SUPERADMIN always passes regardless of the roles listed on the route.
 */
@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(
      ADMIN_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const admin = request.user;

    if (!admin) throw new ForbiddenException('Admin context not found.');
    if (admin.role === AdminRole.SUPERADMIN) return true;

    if (!requiredRoles.includes(admin.role)) {
      throw new ForbiddenException(
        `Insufficient role. Required: ${requiredRoles.join(' or ')}.`,
      );
    }

    return true;
  }
}
