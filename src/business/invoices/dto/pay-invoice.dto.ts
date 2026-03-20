import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class PayInvoiceDto {
  @IsNotEmpty()
  @IsUUID()
  paymentCoaId: string;

  @IsNotEmpty()
  @IsDateString()
  paymentDate: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  paymentReference?: string;
}
