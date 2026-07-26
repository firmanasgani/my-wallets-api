import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { User as UserModel } from '@prisma/client';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { DeviceTokensService } from './device-tokens.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

@Controller('notifications/device-tokens')
export class DeviceTokensController {
  constructor(private readonly deviceTokensService: DeviceTokensService) {}

  @Post()
  register(
    @GetUser() user: Omit<UserModel, 'passwordHash'>,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.deviceTokensService.register(user.id, dto);
  }

  @Delete(':token')
  unregister(
    @GetUser() user: Omit<UserModel, 'passwordHash'>,
    @Param('token') token: string,
  ) {
    return this.deviceTokensService.unregister(user.id, token);
  }
}
