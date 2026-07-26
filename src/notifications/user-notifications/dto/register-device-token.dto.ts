import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { DevicePlatform } from '@prisma/client';

export class RegisterDeviceTokenDto {
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @IsNotEmpty()
  @IsString()
  token: string;
}
