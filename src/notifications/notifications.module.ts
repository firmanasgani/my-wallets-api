import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UsersModule } from 'src/users/users.module';
import { AdminsModule } from 'src/admin/admins/admins.module';
import { UserNotificationsService } from './user-notifications/user-notifications.service';
import { UserNotificationsController } from './user-notifications/user-notifications.controller';
import { DeviceTokensService } from './user-notifications/device-tokens.service';
import { DeviceTokensController } from './user-notifications/device-tokens.controller';
import { AdminNotificationsService } from './admin-notifications/admin-notifications.service';
import { AdminNotificationsController } from './admin-notifications/admin-notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { FcmService } from './delivery/fcm.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    UsersModule,
    AdminsModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [
    UserNotificationsController,
    DeviceTokensController,
    AdminNotificationsController,
  ],
  providers: [
    UserNotificationsService,
    DeviceTokensService,
    AdminNotificationsService,
    NotificationsGateway,
    FcmService,
  ],
  exports: [UserNotificationsService, AdminNotificationsService, FcmService],
})
export class NotificationsModule {}
