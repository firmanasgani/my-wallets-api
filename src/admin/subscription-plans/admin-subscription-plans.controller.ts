import {
  Body,
  Controller,
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
import { AdminSubscriptionPlansService } from './admin-subscription-plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Public()
@Controller('admin/subscription-plans')
@UseGuards(AdminJwtAuthGuard, AdminRoleGuard)
@RequireAdminRole(AdminRole.SALES)
export class AdminSubscriptionPlansController {
  constructor(
    private readonly adminSubscriptionPlansService: AdminSubscriptionPlansService,
  ) {}

  @Get()
  findAll() {
    return this.adminSubscriptionPlansService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminSubscriptionPlansService.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreatePlanDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.adminSubscriptionPlansService.create(dto, actingAdmin.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.adminSubscriptionPlansService.update(id, dto, actingAdmin.id);
  }

  @Patch(':id/disable')
  disable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.adminSubscriptionPlansService.disable(id, actingAdmin.id);
  }
}
