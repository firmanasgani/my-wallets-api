import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateEmailBlastDto {
  @IsNotEmpty()
  @IsString()
  subject: string;

  @IsNotEmpty()
  @IsString()
  content: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least one recipient.' })
  @IsUUID('4', { each: true })
  userIds: string[];

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
