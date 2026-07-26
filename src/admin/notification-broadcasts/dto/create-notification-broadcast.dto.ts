import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { NotificationBroadcastTargetType } from '@prisma/client';

export class CreateNotificationBroadcastDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  body: string;

  @IsEnum(NotificationBroadcastTargetType)
  targetType: NotificationBroadcastTargetType;

  /** Required when targetType = SPECIFIC_USERS; ignored for ALL_USERS, which resolves recipients at send time. */
  @ValidateIf(
    (dto) => dto.targetType === NotificationBroadcastTargetType.SPECIFIC_USERS,
  )
  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least one recipient.' })
  @IsUUID('4', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
