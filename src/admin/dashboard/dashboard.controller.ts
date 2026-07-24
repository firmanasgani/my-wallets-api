import { Controller, Get, UseGuards } from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';

@Public()
@Controller('admin/dashboard')
@UseGuards(AdminJwtAuthGuard)
export class DashboardController {
  /**
   * Intentionally left empty — stats/aggregation land in a later phase.
   * Kept as a stub so the frontend has a stable route to build against.
   */
  @Get()
  getDashboard() {
    return {};
  }
}
