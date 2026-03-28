import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { CompanyMemberRole } from '@prisma/client';

const INVITABLE_ROLES = [
  CompanyMemberRole.ADMIN,
  CompanyMemberRole.STAFF,
  CompanyMemberRole.VIEWER,
] as const;

type InvitableRole = (typeof INVITABLE_ROLES)[number];

export class InviteMemberDto {
  @Transform(({ value }) => value?.toLowerCase().trim())
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsEnum(INVITABLE_ROLES, {
    message: 'role must be one of: ADMIN, STAFF, VIEWER',
  })
  @IsNotEmpty()
  role!: InvitableRole;
}
