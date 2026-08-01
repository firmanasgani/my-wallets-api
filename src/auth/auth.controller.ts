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
  Delete,
  Res,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from './auth.service';
import { User, User as UserModel } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { Request, Response } from 'express';
import { ChangePasswordDto } from './dto/change-password.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from './decorators/public.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

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
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    const user = await this.authService.validateUser(
      loginDto.login,
      loginDto.password,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const result = await this.authService.login(user, ipAddress, userAgent);
    const refresh = this.authService.issueRefreshToken(user);
    this.setRefreshTokenCookie(
      response,
      refresh.refreshToken,
      refresh.expiresAt,
    );

    return result;
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.getCookie(req, 'refresh_token');
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const result = await this.authService.refresh(refreshToken);
    this.setRefreshTokenCookie(
      response,
      result.refresh.refreshToken,
      result.refresh.expiresAt,
    );

    return { access_token: result.access_token };
  }

  private setRefreshTokenCookie(
    response: Response,
    token: string,
    expires: Date,
  ): void {
    response.cookie('refresh_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      expires,
    });
  }

  private getCookie(req: Request, name: string): string | undefined {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return undefined;

    for (const cookie of cookieHeader.split(';')) {
      const separatorIndex = cookie.indexOf('=');
      if (separatorIndex === -1) continue;
      const cookieName = cookie.slice(0, separatorIndex).trim();
      if (cookieName === name) {
        try {
          return decodeURIComponent(cookie.slice(separatorIndex + 1).trim());
        } catch {
          return undefined;
        }
      }
    }

    return undefined;
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

  @Delete('profile-picture')
  @HttpCode(HttpStatus.OK)
  async deleteProfilePicture(@GetUser() user: UserModel, @Req() req: Request) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.deleteProfilePicture(user.id, ipAddress, userAgent);
  }
  @Delete('delete-account')
  @HttpCode(HttpStatus.OK)
  async deleteAccount(@GetUser() user: UserModel, @Req() req: Request) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.deleteAccount(user.id, ipAddress, userAgent);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyOtpDto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
