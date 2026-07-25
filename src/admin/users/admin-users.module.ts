import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { LogsModule } from 'src/logs/logs.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { MinioModule } from 'src/common/minio/minio.module';

@Module({
  imports: [PrismaModule, LogsModule, AdminAuthModule, MinioModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminUsersModule {}
