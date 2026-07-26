import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { LogsModule } from 'src/logs/logs.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { NotificationBroadcastsService } from './notification-broadcasts.service';
import { AdminNotificationBroadcastsController } from './admin-notification-broadcasts.controller';

@Module({
  imports: [PrismaModule, LogsModule, NotificationsModule],
  controllers: [AdminNotificationBroadcastsController],
  providers: [NotificationBroadcastsService],
  exports: [NotificationBroadcastsService],
})
export class AdminNotificationBroadcastsModule {}
