import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class UpdateEmailBlastDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  content?: string;

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
