import { PartialType } from '@nestjs/mapped-types';
import { CreateTaxConfigDto } from './create-tax-config.dto';

export class UpdateTaxConfigDto extends PartialType(CreateTaxConfigDto) {}
