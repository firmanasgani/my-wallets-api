import { IsInt, IsNumber, IsUUID, Max, Min } from 'class-validator';

/** Record units produced for UNITS_OF_PRODUCTION assets and run their depreciation. */
export class RecordUnitsDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  unitsProduced: number;
}
