import {
    IsNotEmpty,
    IsString,
    MaxLength
} from 'class-validator'

export class LoginDto {
    @IsNotEmpty()
    @IsString()
    @MaxLength(100)
    login: string

    @IsNotEmpty()
    @IsString()
    password: string
}