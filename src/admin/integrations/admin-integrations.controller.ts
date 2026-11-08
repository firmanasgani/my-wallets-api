import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { AdminRoleGuard } from '../auth/guards/admin-role.guard';
import { RequireAdminRole } from '../auth/decorators/require-admin-role.decorator';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { Admin, AdminRole } from '@prisma/client';
import { AdminIntegrationsService } from './admin-integrations.service';
import { UpdatePayfestConfigDto } from './dto/update-payfest-config.dto';
import { SetPayfestMethodDto } from './dto/set-payfest-method.dto';

// Platform-level credentials, not a per-user or per-company concern — only
// SUPERADMIN touches this, same bar as who manages other Admin accounts.
@Public()
@Controller('admin/integrations')
@UseGuards(AdminJwtAuthGuard, AdminRoleGuard)
@RequireAdminRole(AdminRole.SUPERADMIN)
export class AdminIntegrationsController {
  constructor(
    private readonly adminIntegrationsService: AdminIntegrationsService,
  ) {}

  @Get('payfest')
  getPayfestConfig() {
    return this.adminIntegrationsService.getPayfestConfig();
  }

  @Put('payfest')
  updatePayfestConfig(
    @Body() dto: UpdatePayfestConfigDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.adminIntegrationsService.updatePayfestConfig(
      dto,
      actingAdmin.id,
    );
  }

  @Get('payfest/payment-methods')
  listPayfestPaymentMethods() {
    return this.adminIntegrationsService.listPayfestPaymentMethods();
  }

  @Put('payfest/payment-methods/:code')
  setPayfestMethodEnabled(
    @Param('code') code: string,
    @Body() dto: SetPayfestMethodDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.adminIntegrationsService.setPayfestMethodEnabled(
      code,
      dto.isEnabled,
      actingAdmin.id,
    );
  }
}
