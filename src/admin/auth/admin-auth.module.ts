import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { AdminsModule } from 'src/admin/admins/admins.module';
import { LogsModule } from 'src/logs/logs.module';

@Module({
  imports: [
    AdminsModule,
    LogsModule,
    PassportModule.register({ defaultStrategy: 'admin-jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const expiresIn =
          configService.get<string>('ADMIN_JWT_EXPIRES_IN') || '3600';
        return {
          secret: configService.get<string>('ADMIN_JWT_SECRET'),
          signOptions: {
            expiresIn: expiresIn as any,
          },
        };
      },
    }),
    ConfigModule,
  ],
  providers: [AdminAuthService, AdminJwtStrategy],
  controllers: [AdminAuthController],
  exports: [AdminJwtStrategy, PassportModule, JwtModule],
})
export class AdminAuthModule {}
