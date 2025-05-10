import { AccountType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, maxLength, ValidateIf, IsNumber, Min } from "class-validator";

export class CreateAccountDto {
    @IsNotEmpty({message: 'Account name is required'})
    @IsString()
    accountName: string;

    @IsNotEmpty({message: 'Account type is required'})
    @IsEnum(AccountType, { message: 'Account type is invalid' })
    accountType: AccountType;

    @ValidateIf((o) => o.accountType === AccountType.BANK)
    @IsNotEmpty({message: 'Bank ID is required'})
    @IsUUID('4', {message: 'Bank ID is invalid'})
    @IsString()
    bankId?: string

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2}, {message: 'Initial balance is invalid'})
    @Min(0, {message: 'Initial balance must be greater than or equal to 0'})
    initialBalance?: number

    @IsOptional()
    @IsString()
    currency?: string

    @IsOptional()
    @IsString()
    accountNumber?: string
}