import { Module } from '@nestjs/common';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminsModule } from './admins/admins.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AdminUsersModule } from './users/admin-users.module';
import { AdminPaymentsModule } from './payments/admin-payments.module';
import { AdminSubscriptionPlansModule } from './subscription-plans/admin-subscription-plans.module';
import { AdminSubscriptionsModule } from './subscriptions/admin-subscriptions.module';
import { AdminAnnouncementsModule } from './announcements/admin-announcements.module';
import { AdminEmailBlastsModule } from './email-blasts/admin-email-blasts.module';
import { AdminNotificationBroadcastsModule } from './notification-broadcasts/admin-notification-broadcasts.module';

@Module({
  imports: [
    AdminAuthModule,
    AdminsModule,
    DashboardModule,
    AdminUsersModule,
    AdminPaymentsModule,
    AdminSubscriptionPlansModule,
    AdminSubscriptionsModule,
    AdminAnnouncementsModule,
    AdminEmailBlastsModule,
    AdminNotificationBroadcastsModule,
  ],
})
export class AdminModule {}
