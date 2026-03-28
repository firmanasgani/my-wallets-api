import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class SuggestTaxDto {
  @IsOptional()
  @IsUUID()
  debitCoaId?: string;

  @IsOptional()
  @IsUUID()
  creditCoaId?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
