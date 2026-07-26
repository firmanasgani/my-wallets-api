import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

@Injectable()
export class DeviceTokensService {
  constructor(private prisma: PrismaService) {}

  /** Called on app launch/login. Upserted by token so re-registering a still-live token is idempotent. */
  register(userId: string, dto: RegisterDeviceTokenDto) {
    return this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { userId, platform: dto.platform, token: dto.token },
      update: {
        userId,
        platform: dto.platform,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });
  }

  /** Soft-delete on logout — mirrors how the FCM delivery cron deactivates invalid tokens. */
  async unregister(userId: string, token: string) {
    await this.prisma.deviceToken.updateMany({
      where: { token, userId },
      data: { isActive: false },
    });
    return { message: 'Device token unregistered' };
  }
}
