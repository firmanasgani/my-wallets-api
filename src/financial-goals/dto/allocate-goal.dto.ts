import { IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AllocateGoalDto {
  @IsUUID()
  accountId!: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
