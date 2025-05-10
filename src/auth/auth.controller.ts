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
import { Request } from 'express';

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService
    ) {}

    @Post('register')
    async register(
        @Body() registerDto: RegisterDto,
        @Req() req: Request
    ): Promise<Omit<User, 'passwordHash'>> {
        const ipAddress = req.ip
        const userAgent = req.headers['user-agent']
        return this.authService.register(registerDto, ipAddress, userAgent); 
    }

    @HttpCode(HttpStatus.OK)
    @Post('login')
    async login(
        @Body() loginDto: LoginDto,
        @Req() req: Request
    ) {
        const ipAddress = req.ip   
        const userAgent = req.headers['user-agent']
        const user = await this.authService.validateUser(loginDto.login, loginDto.password)
        if(!user) {
            throw new UnauthorizedException('Invalid credentials')
        }

        return this.authService.login(user, ipAddress, userAgent);
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    getProfile(@GetUser() user: Omit<UserModel, 'passwordHash'>): Omit<UserModel, 'passwordHash'>{
        return user
    }
}

