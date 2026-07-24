import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

export const ADMIN_ROLE_KEY = 'admin_role';

export const RequireAdminRole = (...roles: AdminRole[]) =>
  SetMetadata(ADMIN_ROLE_KEY, roles);
