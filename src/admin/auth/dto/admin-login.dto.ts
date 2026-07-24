import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AdminLoginDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  login: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}
