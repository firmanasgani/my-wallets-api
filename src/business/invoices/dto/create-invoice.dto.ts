import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class InvoiceItemDto {
  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  clientEmail?: string;

  @IsOptional()
  @IsString()
  clientAddress?: string;

  @IsNotEmpty()
  @IsDateString()
  issueDate: string;

  @IsNotEmpty()
  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  paymentBankAccountId?: string;

  @IsOptional()
  @IsUUID()
  taxConfigId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];
}
