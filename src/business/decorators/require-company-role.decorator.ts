import { SetMetadata } from '@nestjs/common';
import { CompanyMemberRole } from '@prisma/client';

export const COMPANY_ROLE_KEY = 'company_role';

export const RequireCompanyRole = (...roles: CompanyMemberRole[]) =>
  SetMetadata(COMPANY_ROLE_KEY, roles);
