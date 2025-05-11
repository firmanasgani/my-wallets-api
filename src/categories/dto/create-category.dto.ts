import { CategoryType } from "@prisma/client";
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from "class-validator";

export class CreateCategoryDto {

    @IsNotEmpty({ message: 'Category name is required' })
    name: string

    @IsNotEmpty({ message: 'Category Type Must be selected'})
    type: CategoryType

    @IsOptional()
    @IsUUID('4', { message: 'Parent ID is invalid' })
    parentId?: string

    @IsOptional()
    @IsString()
    icon?: string

    @IsOptional()
    @IsString()
    @Matches(/^(#(([A-Fa-f0-9]{6})|([A-Fa-f0-9]{3})))$/, { message: 'Color code is invalid' })
    color?: string
}