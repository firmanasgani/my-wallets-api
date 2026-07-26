import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class UpdateNotificationBroadcastDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  /** Only meaningful for SPECIFIC_USERS broadcasts — replaces the recipient list. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least one recipient.' })
  @IsUUID('4', { each: true })
  userIds?: string[];

  /** Pass null to unschedule back to a draft. */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;
}
