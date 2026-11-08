import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

export class UpdatePayfestConfigDto {
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['https'], require_protocol: true })
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  accessKeyId?: string;

  // Omit or send "" to leave the stored secret untouched — this is never
  // read back once saved (see AdminIntegrationsService.getPayfestConfig),
  // so there is nothing to "clear" to; issue a new credential in the
  // Payfest CMS and paste that instead.
  @IsOptional()
  @IsString()
  @MinLength(1)
  apiSecret?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  webhookSecret?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
