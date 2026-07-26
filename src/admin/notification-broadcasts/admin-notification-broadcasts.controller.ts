import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { AdminRoleGuard } from '../auth/guards/admin-role.guard';
import { RequireAdminRole } from '../auth/decorators/require-admin-role.decorator';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { Admin, AdminRole } from '@prisma/client';
import { NotificationBroadcastsService } from './notification-broadcasts.service';
import { CreateNotificationBroadcastDto } from './dto/create-notification-broadcast.dto';
import { UpdateNotificationBroadcastDto } from './dto/update-notification-broadcast.dto';

@Public()
@Controller('admin/notification-broadcasts')
@UseGuards(AdminJwtAuthGuard, AdminRoleGuard)
@RequireAdminRole(AdminRole.SALES)
export class AdminNotificationBroadcastsController {
  constructor(private readonly notificationBroadcastsService: NotificationBroadcastsService) {}

  @Get()
  findAll() {
    return this.notificationBroadcastsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.notificationBroadcastsService.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateNotificationBroadcastDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.notificationBroadcastsService.create(dto, actingAdmin.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNotificationBroadcastDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.notificationBroadcastsService.update(id, dto, actingAdmin.id);
  }

  @Post(':id/unschedule')
  unschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.notificationBroadcastsService.unschedule(id, actingAdmin.id);
  }

  @Post(':id/send')
  sendNow(@Param('id', ParseUUIDPipe) id: string) {
    return this.notificationBroadcastsService.sendNow(id);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.notificationBroadcastsService.remove(id, actingAdmin.id);
  }
}
