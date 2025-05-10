import {
    IsEmail,
    IsNotEmpty,
    IsString,
    MinLength,
    MaxLength,
    Matches,
    maxLength,
    IsOptional
} from 'class-validator';

export class RegisterDto {
    @IsNotEmpty()
    @IsString()
    @MinLength(4)
    @MaxLength(30)
    @Matches(/^[a-zA-Z0-9_]+$/, {
        message: 'Username can only contain letters, numbers, and underscores.',
    })
    username: string;

    @IsNotEmpty()
    @IsEmail()
    @MaxLength(100)
    email: string

    @IsNotEmpty()
    @IsString()
    @MinLength(8, {message: 'Password is too short. Minimum length is 8 characters.'})
    @Matches(
        /(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])/, 
        {message: 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character.'}
    )
    password: string

    @IsOptional()
    @IsString()
    fullName?: string

}