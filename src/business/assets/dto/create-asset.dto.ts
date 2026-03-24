import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AssetType, DepreciationMethod } from '@prisma/client';

export class CreateAssetDto {
  @IsEnum(AssetType)
  assetType: AssetType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code: string;

  @IsDateString()
  acquisitionDate: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  acquisitionCost: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  residualValue?: number;

  @IsInt()
  @Min(1)
  @Max(600) // max 50 years
  usefulLifeMonths: number;

  @IsEnum(DepreciationMethod)
  depreciationMethod: DepreciationMethod;

  /**
   * Required when depreciationMethod = UNITS_OF_PRODUCTION.
   * Total estimated production units over asset's useful life.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  unitsTotal?: number;

  /** COA that records the asset's acquisition cost (e.g. 1-004 Aset Tetap) */
  @IsUUID()
  assetCoaId: string;

  /** COA that accumulates depreciation (e.g. 1-005 Akumulasi Penyusutan) */
  @IsUUID()
  accumulatedCoaId: string;

  /** COA for periodic depreciation expense (e.g. 5-004 Beban Penyusutan) */
  @IsUUID()
  depreciationExpenseCoaId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
