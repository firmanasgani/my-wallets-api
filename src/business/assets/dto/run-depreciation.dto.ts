import {
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class RunDepreciationDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  /**
   * If provided, run depreciation only for these asset IDs.
   * If omitted, run for ALL ACTIVE assets in the company.
   */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assetIds?: string[];
}
