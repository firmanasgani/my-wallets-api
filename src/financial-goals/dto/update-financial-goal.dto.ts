import { GoalStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsInt, IsNumberString, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

export class UpdateFinancialGoalDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsNumberString()
    targetAmount?: string

    @IsOptional()
    @IsDateString()
    targetDate?: String

    @IsOptional()
    @IsString()
    @MaxLength(255)
    description?: string

    @IsOptional()
    @IsEnum(GoalStatus)
    status?: GoalStatus

    @IsOptional()
    @IsInt()
    @IsPositive()
    priority?: number
}