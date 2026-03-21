import { IsDateString, IsOptional } from 'class-validator';

export class BalanceSheetQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}
