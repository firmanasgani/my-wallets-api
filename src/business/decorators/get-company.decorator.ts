import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Company } from '@prisma/client';

export const GetCompany = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Company => {
    const request = ctx.switchToHttp().getRequest();
    return request.company;
  },
);
