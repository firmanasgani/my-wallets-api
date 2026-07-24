import { Module } from '@nestjs/common';
import { AdminSubscriptionPlansController } from './admin-subscription-plans.controller';
import { AdminSubscriptionPlansService } from './admin-subscription-plans.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { LogsModule } from 'src/logs/logs.module';
import { AdminAuthModule } from '../auth/admin-auth.module';

@Module({
  imports: [PrismaModule, LogsModule, AdminAuthModule],
  controllers: [AdminSubscriptionPlansController],
  providers: [AdminSubscriptionPlansService],
})
export class AdminSubscriptionPlansModule {}
