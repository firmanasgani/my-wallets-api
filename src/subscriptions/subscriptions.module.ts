import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionsController } from './subscriptions.controller';
import { MidtransNotificationController } from './midtrans-notification.controller';
import { SubscriptionsService } from './subscriptions.service';
import { LogsModule } from '../logs/logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MinioModule } from '../common/minio/minio.module';

@Module({
  imports: [ConfigModule, LogsModule, PrismaModule, MinioModule],
  controllers: [SubscriptionsController, MidtransNotificationController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
