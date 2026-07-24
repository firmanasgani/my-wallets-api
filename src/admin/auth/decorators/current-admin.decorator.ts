import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Admin } from '@prisma/client';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Omit<Admin, 'passwordHash'> => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
