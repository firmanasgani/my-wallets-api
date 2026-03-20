import { ChartOfAccountType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateChartOfAccountDto {
    @IsNotEmpty()
    @IsString()
    code: string;

    @IsNotEmpty()
    @IsString()
    name: string;

    @IsNotEmpty()
    @IsEnum(ChartOfAccountType)
    type: ChartOfAccountType;

    @IsOptional()
    @IsNumber()
    @Min(0)
    openingBalance?: number;
}