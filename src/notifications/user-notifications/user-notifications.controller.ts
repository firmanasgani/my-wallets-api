import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { NotificationType, User as UserModel } from '@prisma/client';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { UserNotificationsService } from './user-notifications.service';

@Controller('notifications')
export class UserNotificationsController {
  constructor(
    private readonly userNotificationsService: UserNotificationsService,
  ) {}

  @Get()
  findAll(
    @GetUser() user: Omit<UserModel, 'passwordHash'>,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('isRead') isRead?: string,
    @Query('type') type?: NotificationType,
  ) {
    return this.userNotificationsService.list(user.id, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      isRead: isRead === undefined ? undefined : isRead === 'true',
      type,
    });
  }

  @Get('unread-count')
  unreadCount(@GetUser() user: Omit<UserModel, 'passwordHash'>) {
    return this.userNotificationsService.unreadCount(user.id);
  }

  @Get(':id')
  findOne(
    @GetUser() user: Omit<UserModel, 'passwordHash'>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.userNotificationsService.findOne(user.id, id);
  }

  @Patch('read-all')
  markAllRead(@GetUser() user: Omit<UserModel, 'passwordHash'>) {
    return this.userNotificationsService.markAllRead(user.id);
  }

  @Patch(':id/read')
  markRead(
    @GetUser() user: Omit<UserModel, 'passwordHash'>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.userNotificationsService.markRead(user.id, id);
  }
}
