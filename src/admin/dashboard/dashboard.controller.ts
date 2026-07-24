import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { Admin } from '@prisma/client';
import { DashboardService } from './dashboard.service';

@Public()
@Controller('admin/dashboard')
@UseGuards(AdminJwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getDashboard(
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 29);
    defaultFrom.setHours(0, 0, 0, 0);

    const rangeFrom = from ? new Date(from) : defaultFrom;
    const rangeTo = to ? new Date(to) : now;

    return this.dashboardService.getDashboard(
      actingAdmin.role,
      actingAdmin.id,
      rangeFrom,
      rangeTo,
    );
  }
}
