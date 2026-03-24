import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
