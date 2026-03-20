import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCompanyBankAccountDto {
  @IsNotEmpty()
  @IsString()
  bankName: string;

  @IsNotEmpty()
  @IsString()
  accountNumber: string;

  @IsNotEmpty()
  @IsString()
  accountHolder: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
