

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User as UserModel } from '@prisma/client';

export const GetUser = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): Omit<UserModel, 'passwordHash'> => {
        const request = ctx.switchToHttp().getRequest();
        return request.user;
    }
)