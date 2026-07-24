import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { AdminRoleGuard } from '../auth/guards/admin-role.guard';
import { RequireAdminRole } from '../auth/decorators/require-admin-role.decorator';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { Admin, AdminRole, SubscriptionStatus } from '@prisma/client';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';

@Public()
@Controller('admin/subscriptions')
@UseGuards(AdminJwtAuthGuard, AdminRoleGuard)
export class AdminSubscriptionsController {
  constructor(
    private readonly adminSubscriptionsService: AdminSubscriptionsService,
  ) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: SubscriptionStatus,
  ) {
    return this.adminSubscriptionsService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
    });
  }

  @Patch(':id/cancel')
  @RequireAdminRole(AdminRole.SALES)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSubscriptionDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.adminSubscriptionsService.cancel(id, actingAdmin.id, dto.reason);
  }
}
