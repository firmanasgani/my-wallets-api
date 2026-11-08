import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionsController } from './subscriptions.controller';
import { MidtransNotificationController } from './midtrans-notification.controller';
import { PayfestNotificationController } from './payfest-notification.controller';
import { SubscriptionsService } from './subscriptions.service';
import { LogsModule } from '../logs/logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MinioModule } from '../common/minio/minio.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PayfestModule } from '../payfest/payfest.module';

@Module({
  imports: [
    ConfigModule,
    LogsModule,
    PrismaModule,
    MinioModule,
    NotificationsModule,
    PayfestModule,
  ],
  controllers: [
    SubscriptionsController,
    MidtransNotificationController,
    PayfestNotificationController,
  ],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
