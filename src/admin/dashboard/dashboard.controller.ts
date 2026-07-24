import { Controller, Get, UseGuards } from '@nestjs/common';
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
  getDashboard(@CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>) {
    return this.dashboardService.getDashboard(actingAdmin.role, actingAdmin.id);
  }
}
