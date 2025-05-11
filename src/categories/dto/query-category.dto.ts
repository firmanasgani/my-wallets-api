import { CategoryType } from "@prisma/client";
import { IsBooleanString, IsEnum, IsOptional, IsString, IsUUID } from "class-validator";

export class QueryCategoryDto {
    @IsOptional()
    @IsEnum(CategoryType, { message: 'Category type is invalid' })
    categoryType?: CategoryType

    @IsOptional()
    @IsString()
    @IsBooleanString({ message: 'IncludeGlobal is invalid' })
    includeGlobal?: string
    
    @IsOptional()
    @IsString()
    @IsBooleanString({ message: 'Hierarchical is invalid' })
    hierarchical?: string
    
    @IsOptional()
    @IsUUID('4')
    parentOnly?: string
}