import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  npwp?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  email?: string;

  @IsOptional()
  @IsBoolean()
  taxEnabled?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxRate?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  /** Phase 8: enable/disable checker-approver workflow for manual transactions */
  @IsOptional()
  @IsBoolean()
  requiresApprovalWorkflow?: boolean;
}
