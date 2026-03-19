import { ChartOfAccountType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsString } from "class-validator";

export class CreateChartOfAccountDto {
    @IsNotEmpty()
    @IsString()
    code: string;

    @IsNotEmpty()
    @IsString()
    name: string;

    @IsNotEmpty()
    @IsString()
    companyId: string;


    @IsNotEmpty()
    @IsEnum(ChartOfAccountType)
    type: ChartOfAccountType;
}