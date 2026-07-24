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
import { Admin, AdminRole, PaymentMethod, PaymentStatus } from '@prisma/client';
import { AdminPaymentsService } from './admin-payments.service';
import { RejectPaymentDto } from './dto/reject-payment.dto';

@Public()
@Controller('admin/payments')
@UseGuards(AdminJwtAuthGuard, AdminRoleGuard)
export class AdminPaymentsController {
  constructor(private readonly adminPaymentsService: AdminPaymentsService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: PaymentStatus,
    @Query('method') method?: PaymentMethod,
  ) {
    return this.adminPaymentsService.listPayments({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
      method,
    });
  }

  @Patch(':id/approve')
  @RequireAdminRole(AdminRole.SALES)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.adminPaymentsService.approve(id, actingAdmin.id);
  }

  @Patch(':id/reject')
  @RequireAdminRole(AdminRole.SALES)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectPaymentDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.adminPaymentsService.reject(id, actingAdmin.id, dto.reason);
  }
}
