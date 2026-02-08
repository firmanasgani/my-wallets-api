import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { defaultCategoryTemplates } from 'src/common/category';
import { UsersService } from 'src/users/users.service';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import {
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

@Injectable()
export class AuthService {
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
              for (const subTemplate of template.subCategories) {
                await tx.category.create({
                  data: {
                    categoryName: subTemplate.categoryName,
                    categoryType: subTemplate.categoryType,
                    userId: newUser.id,
                    parentCategoryId: parentCategory.id,
                    icon: subTemplate.icon,
                    color: subTemplate.color,
                  },
                });
              }
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
      console.log(`Failed to create log entry: ${error.message}`);
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
        Logger.error('Failed to create log entry for password change', {
          errorMessage: error.message,
          userId: user.id,
        });
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
    const filePath = `/profile/${fileName}`;

    try {
      // Upload new file to MinIO
      await this.minioService.uploadFile(file, filePath);

      // Delete old profile picture if exists
      if (user.profilePicture) {
        try {
          await this.minioService.deleteFile(user.profilePicture);
        } catch (error) {
          Logger.warn(`Failed to delete old profile picture: ${error.message}`);
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
        Logger.error('Failed to create log entry for profile picture update', {
          errorMessage: error.message,
          userId,
        });
      }

      // Remove password hash from response
      const { passwordHash, ...result } = updatedUser;

      return {
        message: 'Profile picture updated successfully',
        user: result,
        profilePicturePath: filePath,
      };
    } catch (error) {
      Logger.error('Error updating profile picture', error);
      Logger.error(`Error details: ${error.message}`);
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
        Logger.error(
          'Failed to create log entry for profile picture deletion',
          {
            errorMessage: error.message,
            userId,
          },
        );
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

    try {
      // 1. Delete profile picture from MinIO if exists
      if (user.profilePicture) {
        try {
          await this.minioService.deleteFile(user.profilePicture);
        } catch (error) {
          Logger.warn(
            `Failed to delete profile picture during account deletion: ${error.message}`,
          );
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
        Logger.warn(`Failed to generate profile picture URL: ${error.message}`);
      }
    }

    const activeSubscription = user.subscriptions[0];
    let daysRemaining: number | null = null;
    if (activeSubscription?.endDate) {
      const diff =
        new Date(activeSubscription.endDate).getTime() - new Date().getTime();
      daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    const displayPlan = activeSubscription?.plan.code?.startsWith('PREMIUM')
      ? 'PREMIUM'
      : 'FREE';

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
}
