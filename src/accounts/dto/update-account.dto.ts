import { PartialType } from "@nestjs/mapped-types";
import { CreateAccountDto } from "./create-account.dto";
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, maxLength, ValidateIf } from "class-validator";
import { AccountType } from "@prisma/client";

export class UpdateAccountDto extends PartialType(CreateAccountDto) {

    @IsOptional()
    @IsString()
    accountName?: string

    @IsOptional()
    @IsEnum(['CASH', 'BANK'], { message: 'Account type is invalid' })
    accountType?: AccountType

    @ValidateIf((o) => o.accountType === AccountType.BANK && o.bankId !== undefined)
    @IsNotEmpty({message: 'Bank ID is required'})
    @IsUUID('4', {message: 'Bank ID is invalid'})
    @IsString()
    bankId?: string

    @IsOptional()
    @IsString()
    accountNumber?: string
}
