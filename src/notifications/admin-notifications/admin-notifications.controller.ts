import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Admin, NotificationType } from '@prisma/client';
import { Public } from 'src/auth/decorators/public.decorator';
import { AdminJwtAuthGuard } from 'src/admin/auth/guards/admin-jwt-auth.guard';
import { AdminRoleGuard } from 'src/admin/auth/guards/admin-role.guard';
import { CurrentAdmin } from 'src/admin/auth/decorators/current-admin.decorator';
import { AdminNotificationsService } from './admin-notifications.service';

@Public()
@Controller('admin/notifications')
@UseGuards(AdminJwtAuthGuard, AdminRoleGuard)
export class AdminNotificationsController {
  constructor(
    private readonly adminNotificationsService: AdminNotificationsService,
  ) {}

  @Get()
  findAll(
    @CurrentAdmin() admin: Omit<Admin, 'passwordHash'>,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('isRead') isRead?: string,
    @Query('type') type?: NotificationType,
  ) {
    return this.adminNotificationsService.list(admin.id, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      isRead: isRead === undefined ? undefined : isRead === 'true',
      type,
    });
  }

  @Get('unread-count')
  unreadCount(@CurrentAdmin() admin: Omit<Admin, 'passwordHash'>) {
    return this.adminNotificationsService.unreadCount(admin.id);
  }

  @Patch('read-all')
  markAllRead(@CurrentAdmin() admin: Omit<Admin, 'passwordHash'>) {
    return this.adminNotificationsService.markAllRead(admin.id);
  }

  @Patch(':id/read')
  markRead(
    @CurrentAdmin() admin: Omit<Admin, 'passwordHash'>,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminNotificationsService.markRead(admin.id, id);
  }
}
