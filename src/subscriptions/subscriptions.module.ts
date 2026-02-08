import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { MidtransNotificationController } from './midtrans-notification.controller';
import { SubscriptionsService } from './subscriptions.service';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports: [LogsModule],
  controllers: [SubscriptionsController, MidtransNotificationController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
