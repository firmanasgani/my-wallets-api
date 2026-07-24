import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
