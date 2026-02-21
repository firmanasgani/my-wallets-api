import { IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ReleaseGoalDto {
  @IsUUID()
  accountId!: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
