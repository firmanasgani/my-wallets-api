import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class DisposeAssetDto {
  @IsDateString()
  disposalDate: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  disposalAmount: number;

  /** COA to debit when receiving disposal proceeds (e.g. Kas/Bank) */
  @IsUUID()
  disposalCoaId: string;

  @IsOptional()
  @IsUUID()
  gainCoaId?: string; // override for Gain on Disposal COA

  @IsOptional()
  @IsUUID()
  lossCoaId?: string; // override for Loss on Disposal COA
}
