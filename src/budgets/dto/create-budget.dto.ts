import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
} from 'class-validator';

export class CreateBudgetDto {
  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  amount: number;

  @IsInt()
  @IsNotEmpty()
  @Min(2000)
  @Max(2100)
  year: number;

  @IsInt()
  @IsNotEmpty()
  @Min(1)
  @Max(12)
  month: number;

  @IsString()
  @IsOptional()
  description?: string;
}
