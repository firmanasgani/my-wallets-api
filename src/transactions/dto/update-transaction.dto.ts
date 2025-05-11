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

export class UpdateTransactionDto {
  @IsNotEmpty({ message: 'Amount cannot be empty' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Amount is invalid' })
  @Min(0.01, { message: 'Amount must be greater than or equal to 0' })
  @Type(() => Number)
  amount: number;

  @IsNotEmpty({ message: 'Category Id cananot be empty' })
  @IsUUID('4', { message: 'Category Id is invalid' })
  categoryId: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date is invalid' })
  transactionDate?: Date;

  @IsOptional()
  @IsString()
  description?: string;
}
