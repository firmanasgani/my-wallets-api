import { IsDateString, IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from "class-validator";


export class CreateFinancialGoalDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @IsNumberString()
    targetAmount: string

    @IsOptional()
    @IsDateString()
    targetDate?: String

    @IsOptional()
    @IsString()
    @MaxLength(255)
    description?: string
}