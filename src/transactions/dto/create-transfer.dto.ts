import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateTransferDto {
  @IsNotEmpty({ message: 'Amount cannot be empty' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Amount is invalid' })
  @Min(0.01, { message: 'Amount must be greater than or equal to 0' })
  @Type(() => Number)
  amount: number;

  @IsNotEmpty({ message: 'Source account Id cananot be empty' })
  @IsUUID('4', { message: 'Source account Id is invalid' })
  sourceAccountId: string;

  @IsNotEmpty({ message: 'Destination account Id cananot be empty' })
  @IsUUID('4', { message: 'Destination account Id is invalid' })
  destinationAccountId: string;

  @IsOptional()
  @IsUUID('4', { message: 'Category Id is invalid' })
  categoryId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date is invalid' })
  transactionDate?: Date;

  @IsOptional()
  @IsString()
  description?: string;
}
