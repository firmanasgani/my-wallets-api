import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsModule } from '../notifications.module';
import { AdminNotificationBroadcastsModule } from 'src/admin/notification-broadcasts/admin-notification-broadcasts.module';
import { NotificationsCron } from './notifications.cron';

/**
 * A dedicated leaf module for the shared cron (see NOTIFICATION_SYSTEM_PLAN.md §7).
 * The cron needs FcmService (from NotificationsModule) and NotificationBroadcastsService
 * (from AdminNotificationBroadcastsModule, which itself depends on NotificationsModule
 * for UserNotificationsService). Wiring the cron here — rather than inside either of
 * those two modules — keeps the dependency graph a DAG instead of a cycle.
 */
@Module({
  imports: [PrismaModule, NotificationsModule, AdminNotificationBroadcastsModule],
  providers: [NotificationsCron],
})
export class NotificationsCronModule {}
