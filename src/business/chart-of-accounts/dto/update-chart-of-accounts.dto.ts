import { ChartOfAccountType } from "@prisma/client";
import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class UpdateChartOfAccountsDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsEnum(ChartOfAccountType)
    type?: ChartOfAccountType;

    @IsOptional()
    @IsNumber()
    @Min(0)
    openingBalance?: number;
}
