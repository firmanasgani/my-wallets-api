import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Only fields safe to change after the asset has been created.
 *  Cost, COA, and method cannot be changed once depreciation has been run. */
export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
