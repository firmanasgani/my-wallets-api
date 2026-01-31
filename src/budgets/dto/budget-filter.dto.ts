import { IsInt, IsOptional, IsUUID, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class BudgetFilterDto {
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  @Type(() => Number)
  year?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  month?: number;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
