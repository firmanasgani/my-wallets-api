import { IsEnum, IsNotEmpty } from 'class-validator';
import { CompanyMemberRole } from '@prisma/client';

const ASSIGNABLE_ROLES = [
  CompanyMemberRole.ADMIN,
  CompanyMemberRole.STAFF,
  CompanyMemberRole.VIEWER,
] as const;

export class UpdateMemberRoleDto {
  @IsEnum(ASSIGNABLE_ROLES, {
    message: 'role must be one of: ADMIN, STAFF, VIEWER',
  })
  @IsNotEmpty()
  role: (typeof ASSIGNABLE_ROLES)[number];
}
