import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { defaultCategoryTemplates } from 'src/common/category';
import { UsersService } from 'src/users/users.service';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import {
  CompanyMemberStatus,
  LogActionType,
  Prisma,
  SubscriptionStatus,
  User,
} from '@prisma/client';
import { LogsService } from 'src/logs/logs.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { MinioService } from 'src/common/minio/minio.service';
import { randomUUID } from 'crypto';
import { Multer } from 'multer';
import { Resend } from 'resend';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  // In-memory store for OTP rate limiting: email -> timestamp of last request
  private otpRequestTimeStore = new Map<string, number>();

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private logsService: LogsService,
    private minioService: MinioService,
  ) {}

  async register(
    RegisterDto: RegisterDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Omit<User, 'passwordHash'>> {
    const { username, email, password, fullName } = RegisterDto;

    const existingUserByEmail = await this.usersService.findByEmail(email);
    if (existingUserByEmail) {
      throw new ConflictException('Email already registered.');
    }
    const existingUserByUsername =
      await this.usersService.findByUsername(username);
    if (existingUserByUsername) {
      throw new ConflictException('Username already registered.');
    }
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    try {
      const newUserAndCategories = await this.prisma.$transaction(
        async (tx) => {
          const newUser = await tx.user.create({
            data: {
              username,
              email,
              passwordHash: hashedPassword,
              fullName: fullName || null,
            },
          });

          for (const template of defaultCategoryTemplates) {
            const parentCategory = await tx.category.create({
              data: {
                categoryName: template.categoryName,
                categoryType: template.categoryType,
                userId: newUser.id,
                parentCategoryId: null,
                icon: template.icon,
                color: template.color,
              },
            });
            if (template.subCategories && template.subCategories.length > 0) {
              const subCategoryData = template.subCategories.map(
                (subTemplate) => ({
                  categoryName: subTemplate.categoryName,
                  categoryType: subTemplate.categoryType,
                  userId: newUser.id,
                  parentCategoryId: parentCategory.id,
                  icon: subTemplate.icon,
                  color: subTemplate.color,
                }),
              );

              await tx.category.createMany({
                data: subCategoryData,
              });
            }
          }

          const freePlan = await tx.subscriptionPlan.findUnique({
            where: { code: 'FREE' },
          });

          if (freePlan) {
            await tx.userSubscription.create({
              data: {
                userId: newUser.id,
                subscriptionPlanId: freePlan.id,
                status: SubscriptionStatus.ACTIVE,
                startDate: new Date(),
              },
            });
          }

          return newUser;
        },
      );

      try {
        await this.logsService.create({
          userId: newUserAndCategories.id,
          actionType: LogActionType.USER_REGISTER,
          entityType: 'USER',
          entityId: newUserAndCategories.id,
          description: `User ${newUserAndCategories.username} registered`,
          details: {
            username: newUserAndCategories.username,
            method: 'credentials',
          },
          ipAddress: ipAddress ?? '',
          userAgent: userAgent ?? '',
        });
      } catch (error) {
        if (error instanceof Error) {
          Logger.error('Failed to create log entry', {
          errorMessage: error.message,
          dto: {
            userId: newUserAndCategories.id,
            actionType: LogActionType.USER_REGISTER,
            entityType: 'USER',
            entityId: newUserAndCategories.id,
            description: `User ${newUserAndCategories.username} registered`,
            details: {
              username: newUserAndCategories.username,
              method: 'credentials',
            },
            ipAddress: ipAddress ?? '',
            userAgent: userAgent ?? '',
          },
          stack: error.stack,
        });
        }else {
          Logger.error('Failed to create log entry (non-error thrown)', {
      error,
    });

        }
      }
      const { passwordHash, ...result } = newUserAndCategories;
      return result as Omit<User, 'passwordHash'>;
    } catch (error) {
      console.error('Error creating user:', error);
      throw new InternalServerErrorException('Error creating user');
    }
  }

  async validateUser(
    login: string,
    pass: string,
  ): Promise<Omit<User, 'passwordHash'> | null> {
    let user = await this.usersService.findByEmail(login);
    if (!user) {
      user = await this.usersService.findByUsername(login);
    }

    if (
      user &&
      user.passwordHash &&
      (await bcrypt.compare(pass, user.passwordHash))
    ) {
      const { passwordHash, ...result } = user;
      return result as Omit<User, 'passwordHash'>;
    }

    return null;
  }

  async login(
    user: Omit<User, 'passwordHash'>,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const payload = { username: user.username, sub: user.id };
    try {
      await this.logsService.create({
        userId: user.id,
        actionType: LogActionType.USER_LOGIN,
        entityType: 'USER',
        entityId: user.id,
        description: `User ${user.username} logged in`,
        details: { username: user.username, method: 'credentials' },
        ipAddress: ipAddress ?? '',
        userAgent: userAgent ?? '',
      });
    } catch (error) {
      if (error instanceof Error) {
        Logger.error('Failed to create log entry for login', {
          errorMessage: error.message,
          userId: user.id,
        });
      } else {
        Logger.error('Failed to create log entry for login (non-error thrown)', {
          error,
        });
      }
    }
    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    const { currentPassword, newPassword } = changePasswordDto;

    // Get user with password hash
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Check if new password is same as current password
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    try {
      // Update password
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: hashedPassword },
      });

      // Log the password change
      try {
        await this.logsService.create({
          userId: user.id,
          actionType: LogActionType.USER_PROFILE_UPDATE,
          entityType: 'USER',
          entityId: user.id,
          description: `User ${user.username} changed password`,
          details: { action: 'password_change' },
          ipAddress: ipAddress ?? '',
          userAgent: userAgent ?? '',
        });
      } catch (error) {
        if (error instanceof Error) {
          Logger.error('Failed to create log entry for password change', {
          errorMessage: error.message,
          userId: user.id,
        });
        } else {
          Logger.error('Failed to create log entry for password change (non-error thrown)', {
      error,
    });
        }
      }

      return { message: 'Password changed successfully' };
    } catch (error) {
      Logger.error('Error changing password', error);
      throw new InternalServerErrorException('Failed to change password');
    }
  }

  async updateProfilePicture(
    userId: string,
    file: Express.Multer.File,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Validate file type
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/webp',
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPEG, PNG, and WebP images are allowed',
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size must not exceed 5MB');
    }

    // Get user to check if they have existing profile picture
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Generate unique filename with timestamp and uuid
    const timestamp = Date.now();
    const fileExtension = file.originalname.split('.').pop();
    const uniqueId = randomUUID();
    const fileName = `${timestamp}-${uniqueId}.${fileExtension}`;
    const filePath = `profile/${fileName}`;

    try {
      // Upload new file to MinIO
      await this.minioService.uploadFile(file, filePath);

      // Delete old profile picture if exists
      if (user.profilePicture) {
        try {
          await this.minioService.deleteFile(user.profilePicture);
        } catch (error) {
          if(error instanceof Error) {
            Logger.warn(
              `Failed to delete old profile picture: ${error.message}`,
              {
                userId,
                oldProfilePicture: user.profilePicture,
              },
            );
          } else {
            Logger.warn(
              `Failed to delete old profile picture (non-error thrown)`,
              {
                userId,
                oldProfilePicture: user.profilePicture,
                error,
              },
            );
          }
        }
      }

      // Update user profile picture path in database
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { profilePicture: filePath },
      });

      // Log the profile picture update
      try {
        await this.logsService.create({
          userId,
          actionType: LogActionType.USER_PROFILE_UPDATE,
          entityType: 'USER',
          entityId: userId,
          description: `User ${user.username} updated profile picture`,
          details: {
            action: 'profile_picture_update',
            oldPath: user.profilePicture,
            newPath: filePath,
          },
          ipAddress: ipAddress ?? '',
          userAgent: userAgent ?? '',
        });
      } catch (error) {
        if(error instanceof Error) {
          Logger.error('Failed to create log entry for profile picture update', {
            errorMessage: error.message,
            userId,
          });
        } else {
          Logger.error('Failed to create log entry for profile picture update (non-error thrown)', {
            userId,
            error,
          });
        }
      }

      // Remove password hash from response
      const { passwordHash, ...result } = updatedUser;

      return {
        message: 'Profile picture updated successfully',
        user: result,
        profilePicturePath: filePath,
      };
    } catch (error) {
      if(error instanceof Error) {
        Logger.error('Error updating profile picture', error);
      Logger.error(`Error details: ${error.message}`);
      } else {
        Logger.error('Error updating profile picture (non-error thrown)', {
          error,
        });
      }
      
        throw new BadRequestException('Failed to update profile picture');
    }
  }

  async deleteProfilePicture(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Get user to check if they have existing profile picture
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.profilePicture) {
      throw new BadRequestException('No profile picture to delete');
    }

    try {
      // Delete file from MinIO
      await this.minioService.deleteFile(user.profilePicture);

      // Update user profile picture path in database to null
      await this.prisma.user.update({
        where: { id: userId },
        data: { profilePicture: null },
      });

      // Log the profile picture deletion
      try {
        await this.logsService.create({
          userId,
          actionType: LogActionType.USER_PROFILE_UPDATE,
          entityType: 'USER',
          entityId: userId,
          description: `User ${user.username} deleted profile picture`,
          details: {
            action: 'profile_picture_delete',
            oldPath: user.profilePicture,
          },
          ipAddress: ipAddress ?? '',
          userAgent: userAgent ?? '',
        });
      } catch (error) {
        if(error instanceof Error) {
          Logger.error('Failed to create log entry for profile picture deletion', {
            errorMessage: error.message,
            userId,
          });
        } else {
          Logger.error('Failed to create log entry for profile picture deletion (non-error thrown)', {
            userId,
            error,
          });
        }
      }

      return {
        message: 'Profile picture deleted successfully',
      };
    } catch (error) {
      Logger.error('Error deleting profile picture', error);
      throw new InternalServerErrorException(
        'Failed to delete profile picture',
      );
    }
  }

  async deleteAccount(userId: string, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Block deletion if user is still an active/pending member of a company
    const activeMembership = await this.prisma.companyMember.findFirst({
      where: {
        userId,
        status: { in: [CompanyMemberStatus.ACTIVE, CompanyMemberStatus.PENDING] },
      },
    });

    if (activeMembership) {
      throw new ForbiddenException(
        'Cannot delete account while you are a member of a company. Please ask the company owner to revoke your access first.',
      );
    }

    // Block deletion if user owns a company
    const ownedCompany = await this.prisma.company.findFirst({
      where: { ownerId: userId },
    });

    if (ownedCompany) {
      throw new ForbiddenException(
        'Cannot delete account while you own a company. Please delete the company first.',
      );
    }

    try {
      // 1. Delete profile picture from MinIO if exists
      if (user.profilePicture) {
        try {
          await this.minioService.deleteFile(user.profilePicture);
        } catch (error) {
          if(error instanceof Error) {
            Logger.warn(
              `Failed to delete profile picture during account deletion: ${error.message}`,
            );
          } else {
            Logger.warn(
              `Failed to delete profile picture during account deletion (non-error thrown): ${error}`,
            );
          }
        }
      }

      // 2. Delete all user data in a transaction to ensure complete cleanup
      await this.prisma.$transaction(async (tx) => {
        // Delete Budgets
        await tx.budget.deleteMany({ where: { userId } });

        // Delete Transactions
        await tx.transaction.deleteMany({ where: { userId } });

        // Delete Accounts (Transactions referencing these will be SetNull or already deleted)
        await tx.account.deleteMany({ where: { userId } });

        // Delete Categories
        await tx.category.deleteMany({ where: { userId } });

        // Delete User
        await tx.user.delete({ where: { id: userId } });

        // Input log
        await tx.log.create({
          data: {
            userId,
            actionType: LogActionType.USER_DELETE,
            entityType: 'USER',
            entityId: userId,
            description: `User ${user.username} deleted their account`,
            details: {
              action: 'account_deletion',
            },
            ipAddress: ipAddress ?? '',
            userAgent: userAgent ?? '',
          },
        });
      });

      // 3. Log the account deletion
      Logger.log(`User ${user.username} (${user.id}) deleted their account`);

      return {
        message: 'Account and all associated data deleted successfully',
      };
    } catch (error) {
      Logger.error('Error deleting account', error);
      throw new InternalServerErrorException('Failed to delete account');
    }
  }

  async getProfileWithUrl(userId: string): Promise<
    Omit<User, 'passwordHash'> & {
      profilePictureUrl?: string;
      activeSubscription?: any;
      subscriptionPlan?: string;
    }
  > {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscriptions: {
          where: { status: SubscriptionStatus.ACTIVE },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const { passwordHash, ...userWithoutPassword } = user;

    // Generate presigned URL if profile picture exists
    let profilePictureUrl: string | undefined;
    if (user.profilePicture) {
      try {
        profilePictureUrl = await this.minioService.getFileUrl(
          user.profilePicture,
        );
      } catch (error) {
        if(error instanceof Error) {
          Logger.error('Error generating profile picture URL', error);
        Logger.error(`Error details: ${error.message}`);
        } else {
          Logger.error('Error generating profile picture URL (non-error thrown)', {
            error,
          });
        }
        
        throw new BadRequestException('Failed to generate profile picture URL');
      }
    }

    const activeSubscription = user.subscriptions[0];
    let daysRemaining: number | null = null;
    if (activeSubscription?.endDate) {
      const diff =
        new Date(activeSubscription.endDate).getTime() - new Date().getTime();
      daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    let displayPlan = 'FREE';
    const planCode = activeSubscription?.plan?.code;
    
    if (planCode) {
      if (planCode.startsWith('PREMIUM')) {
        displayPlan = 'PREMIUM';
      } else if (planCode.startsWith('BUSINESS')) {
        displayPlan = 'BUSINESS';
      } else {
        displayPlan = planCode;
      }
    }

    return {
      ...userWithoutPassword,
      ...(profilePictureUrl && { profilePictureUrl }),
      subscriptionPlan: displayPlan,
      activeSubscription: activeSubscription
        ? {
            planName: activeSubscription.plan.name,
            planCode: activeSubscription.plan.code,
            startDate: activeSubscription.startDate,
            endDate: activeSubscription.endDate,
            expiresAt: activeSubscription.endDate,
            daysRemaining,
          }
        : null,
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Don't leak user existence
      return { message: 'If the email is registered, an OTP has been sent.' };
    }

    if(email == 'demo@firmanasgani.id') {
      throw new BadRequestException('This account is for demo purposes only. Cannot use forgot password feature.');
    }
    
    // Rate Limiting (In-memory, 1 request per 1 minute)
    const now = Date.now();
    const lastRequestTime = this.otpRequestTimeStore.get(email);
    const cooldownPeriod = 60 * 1000; // 1 minute in milliseconds

    if (lastRequestTime && now - lastRequestTime < cooldownPeriod) {
      const waitTimeMath = Math.ceil((cooldownPeriod - (now - lastRequestTime)) / 1000);
      throw new BadRequestException(`Harap tunggu ${waitTimeMath} detik sebelum meminta OTP baru.`);
    }

    // Update last request time
    this.otpRequestTimeStore.set(email, now);
    
    // Cleanup old entries (optional, to prevent memory leak long-term)
    if (this.otpRequestTimeStore.size > 1000) {
      for (const [key, time] of this.otpRequestTimeStore.entries()) {
        if (now - time > cooldownPeriod) {
          this.otpRequestTimeStore.delete(key);
        }
      }
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 5); // 5 minutes expiry

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordOtp: otp,
        resetPasswordOtpExpires: expires,
      },
    });

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromAddress = (process.env.SMTP_FROM || 'Moneytory <noreply@moneytory.com>').replace(/^["']|["']$/g, '');

    try {
      const { error } = await resend.emails.send({
        from: fromAddress,
        to: user.email,
        subject: 'Password Reset OTP - Moneytory',
        text: `Your OTP for password reset is: ${otp}. It will expire in 5 minutes.`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset OTP</title>
            <style>
              body {
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                background-color: #f8fafc;
                margin: 0;
                padding: 0;
                color: #334155;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                margin-top: 40px;
                margin-bottom: 40px;
              }
              .header {
                background-color: #1d4ed8;
                padding: 30px 20px;
                text-align: center;
              }
              .logo-text {
                color: #ffffff;
                font-size: 24px;
                font-weight: 700;
                letter-spacing: 1px;
                margin: 0;
              }
              .content {
                padding: 40px 30px;
                text-align: center;
              }
              .title {
                font-size: 20px;
                font-weight: 600;
                color: #0f172a;
                margin-top: 0;
                margin-bottom: 16px;
              }
              .message {
                font-size: 15px;
                line-height: 1.6;
                color: #475569;
                margin-bottom: 30px;
              }
              .otp-container {
                background-color: #eff6ff;
                border: 1px solid #bfdbfe;
                border-radius: 8px;
                padding: 24px;
                margin-bottom: 30px;
              }
              .otp-code {
                font-size: 36px;
                font-weight: 700;
                letter-spacing: 8px;
                color: #1d4ed8;
                margin: 0;
              }
              .footer {
                padding: 20px 30px;
                background-color: #f8fafc;
                border-top: 1px solid #e2e8f0;
                text-align: center;
                font-size: 13px;
                color: #64748b;
              }
              .important-note {
                font-size: 13px;
                color: #ef4444;
                margin-top: 10px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 class="logo-text">Moneytory</h1>
              </div>
              <div class="content">
                <h2 class="title">Reset Kata Sandi</h2>
                <p class="message">
                  Halo, kami menerima permintaan reset kata sandi untuk akun Anda. 
                  Gunakan kode OTP berikut untuk melanjutkan proses pemulihan akun:
                </p>
                <div class="otp-container">
                  <h3 class="otp-code">${otp}</h3>
                </div>
                <p class="message">
                  Kode OTP ini hanya berlaku selama <span style="font-weight: 600; color: #1d4ed8;">5 menit</span>.
                  Jika Anda tidak meminta reset kata sandi, Anda dapat mengabaikan email ini dengan aman.
                </p>
                <p class="important-note">
                  Jangan pernah membagikan kode OTP ini kepada siapapun!
                </p>
              </div>
              <div class="footer">
                <p style="margin: 0;">&copy; ${new Date().getFullYear()} My Wallets. Hak Cipta Dilindungi.</p>
                <p style="margin: 8px 0 0 0;">Jika Anda memiliki pertanyaan, hubungi tim dukungan kami.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });
      
      if (error) {
        Logger.error('Failed to send OTP email via Resend', JSON.stringify(error));
        throw new InternalServerErrorException('Failed to send OTP email');
      }
    } catch (error) {
      Logger.error('Exception when sending OTP email', error instanceof Error ? error.message : JSON.stringify(error));
      throw new InternalServerErrorException('Failed to send OTP email');
    }

    return { message: 'If the email is registered, an OTP has been sent.' };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { email, otp } = verifyOtpDto;
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.resetPasswordOtp !== otp) {
      throw new BadRequestException('Invalid OTP');
    }

    if (user.resetPasswordOtpExpires && new Date() > user.resetPasswordOtpExpires) {
      throw new BadRequestException('OTP has expired');
    }

    const token = randomUUID();
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 15); // Token valid for 15 minutes

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordOtp: null,
        resetPasswordOtpExpires: null,
        resetPasswordToken: token,
        resetPasswordTokenExpires: expires,
      },
    });

    return { token };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;
    const user = await this.prisma.user.findFirst({
      where: { resetPasswordToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid token');
    }

    if (user.resetPasswordTokenExpires && new Date() > user.resetPasswordTokenExpires) {
      throw new BadRequestException('Token has expired');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashedPassword,
        resetPasswordToken: null,
        resetPasswordTokenExpires: null,
      },
    });

    return { message: 'Password has been successfully reset' };
  }
}
