import { JournalLineType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CreateJournalLineDto {
  @IsUUID()
  @IsNotEmpty()
  coaId: string;

  @IsEnum(JournalLineType)
  type: JournalLineType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;
}

export class CreateJournalEntryDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsDateString()
  transactionDate: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateJournalLineDto)
  lines: CreateJournalLineDto[];
}
