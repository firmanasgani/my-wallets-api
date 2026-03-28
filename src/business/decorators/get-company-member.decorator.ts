import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CompanyMember } from '@prisma/client';

export const GetCompanyMember = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CompanyMember => {
    const request = ctx.switchToHttp().getRequest();
    return request.companyMember;
  },
);
