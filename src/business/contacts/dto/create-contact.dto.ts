import { ContactType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateContactDto {
  @IsNotEmpty()
  @IsEnum(ContactType)
  type: ContactType;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  bankAccountHolder?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
