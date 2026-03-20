import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateCompanyBankAccountDto {
  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  accountHolder?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
