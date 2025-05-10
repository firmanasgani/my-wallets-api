import { 
    Controller, 
    Post,
    Body,
    HttpCode,
    HttpStatus,
    UnauthorizedException,
    UseGuards,
    Req,
    Get
 } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from './auth.service';
import { User, User as UserModel } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from 'src/common/decorators/get-user.decorator';

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService
    ) {}

    @Post('register')
    async register(
        @Body() registerDto: RegisterDto
    ): Promise<Omit<User, 'passwordHash'>> {
        return this.authService.register(registerDto); 
    }

    @HttpCode(HttpStatus.OK)
    @Post('login')
    async login(@Body() loginDto: LoginDto) {
        const user = await this.authService.validateUser(loginDto.login, loginDto.password)
        if(!user) {
            throw new UnauthorizedException('Invalid credentials')
        }

        return this.authService.login(user);
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    getProfile(@GetUser() user: Omit<UserModel, 'passwordHash'>): Omit<UserModel, 'passwordHash'>{
        return user
    }
}

