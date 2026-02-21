import { GoalLedgerDirection } from '@prisma/client';
import { IsEnum, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AdjustGoalDto {
  @IsUUID()
  accountId!: string;

  @IsNumberString()
  amount!: string;

  @IsEnum(GoalLedgerDirection)
  direction!: GoalLedgerDirection;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
