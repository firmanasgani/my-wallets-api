import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Req,
  Get,
  Patch,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from './auth.service';
import { User, User as UserModel } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { Request } from 'express';
import { ChangePasswordDto } from './dto/change-password.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body() registerDto: RegisterDto,
    @Req() req: Request,
  ): Promise<Omit<User, 'passwordHash'>> {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.register(registerDto, ipAddress, userAgent);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    const user = await this.authService.validateUser(
      loginDto.login,
      loginDto.password,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.authService.login(user, ipAddress, userAgent);
  }

  @Get('profile')
  async getProfile(@GetUser() user: Omit<UserModel, 'passwordHash'>) {
    return this.authService.getProfileWithUrl(user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Patch('change-password')
  async changePassword(
    @GetUser() user: Omit<UserModel, 'passwordHash'>,
    @Body() changePasswordDto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.changePassword(
      user.id,
      changePasswordDto,
      ipAddress,
      userAgent,
    );
  }

  @Patch('profile-picture/upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async uploadProfilePicture(
    @GetUser() user: UserModel,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.updateProfilePicture(
      user.id,
      file,
      ipAddress,
      userAgent,
    );
  }
}
