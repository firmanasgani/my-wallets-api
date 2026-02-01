import {
  IsDecimal,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  ValidateIf,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionType, RecurringInterval } from '@prisma/client';

export class CreateRecurringTransactionDto {
  @IsEnum(TransactionType)
  @IsNotEmpty()
  transactionType: TransactionType;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsUUID()
  @ValidateIf((o) => o.transactionType !== TransactionType.INCOME)
  @IsNotEmpty({
    message: 'Source account is required for Expense and Transfer',
  })
  sourceAccountId?: string;

  @IsUUID()
  @ValidateIf((o) => o.transactionType === TransactionType.TRANSFER)
  @IsNotEmpty({ message: 'Destination account is required for Transfer' })
  destinationAccountId?: string;

  @IsEnum(RecurringInterval)
  @IsNotEmpty()
  interval: RecurringInterval;

  @IsDateString()
  @IsOptional()
  transactionDate?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsOptional()
  isRecurring?: boolean;
}
