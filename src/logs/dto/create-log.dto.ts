import { LogActionType, Prisma } from "@prisma/client";
import { IsEnum, IsIP, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateLogDto {
    
    @IsOptional()
    @IsUUID('4')
    userId?: string

    @IsNotEmpty()
    @IsEnum(LogActionType)
    actionType: LogActionType

    @IsOptional()
    @IsString()
    entityType?: string

    @IsOptional()
    @IsString()
    entityId?: string

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    details: Prisma.JsonValue

    @IsOptional()
    @IsIP()
    ipAddress?: string

    @IsOptional()
    @IsString()
    userAgent?: string
}