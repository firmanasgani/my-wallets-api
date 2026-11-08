import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PayfestWebhookLogStatus } from '@prisma/client';
import { Public } from 'src/auth/decorators/public.decorator';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { AdminRoleGuard } from '../auth/guards/admin-role.guard';
import { RequireAdminRole } from '../auth/decorators/require-admin-role.decorator';
import { AdminRole } from '@prisma/client';
import { AdminWebhookLogsService } from './admin-webhook-logs.service';

// Same platform-level bar as Settings > Integrations — this is the
// receiving side of that same integration's webhook traffic.
@Public()
@Controller('admin/webhook-logs')
@UseGuards(AdminJwtAuthGuard, AdminRoleGuard)
@RequireAdminRole(AdminRole.SUPERADMIN)
export class AdminWebhookLogsController {
  constructor(
    private readonly adminWebhookLogsService: AdminWebhookLogsService,
  ) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: PayfestWebhookLogStatus,
  ) {
    return this.adminWebhookLogsService.list({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
    });
  }
}
