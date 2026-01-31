import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
} from 'class-validator';

export class UpdateBudgetDto {
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  amount?: number;

  @IsInt()
  @IsOptional()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(12)
  month?: number;

  @IsString()
  @IsOptional()
  description?: string;
}
