import { IsDateString, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SpendGoalDto {
  @IsUUID()
  accountId!: string;

  @IsNumberString()
  amount!: string;

  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @IsOptional()
  @IsDateString()
  transactionDate?: string;
}
