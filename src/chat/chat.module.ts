import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { AdminChatController } from './admin-chat.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UsersModule } from 'src/users/users.module';
import { AdminsModule } from 'src/admin/admins/admins.module';
import { AdminAuthModule } from 'src/admin/auth/admin-auth.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    UsersModule,
    AdminsModule,
    AdminAuthModule,
    NotificationsModule,
  ],
  controllers: [ChatController, AdminChatController],
  providers: [ChatService, ChatGateway],
})
export class ChatModule {}
