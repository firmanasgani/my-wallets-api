import { Module } from '@nestjs/common';
import { AdminWebhookLogsController } from './admin-webhook-logs.controller';
import { AdminWebhookLogsService } from './admin-webhook-logs.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AdminAuthModule } from '../auth/admin-auth.module';

@Module({
  imports: [PrismaModule, AdminAuthModule],
  controllers: [AdminWebhookLogsController],
  providers: [AdminWebhookLogsService],
})
export class AdminWebhookLogsModule {}
