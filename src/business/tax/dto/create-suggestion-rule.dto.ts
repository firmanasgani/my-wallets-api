import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ContactType } from '@prisma/client';

export class CreateSuggestionRuleDto {
  @IsUUID()
  taxConfigId: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  triggerCoaIds?: string[];

  @IsOptional()
  @IsEnum(ContactType)
  triggerContactType?: ContactType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  triggerKeywords?: string[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
