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
import { AdminRole, Admin } from '@prisma/client';
import { AdminsService } from './admins.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';

@Public()
@Controller('admin/admins')
@UseGuards(AdminJwtAuthGuard, AdminRoleGuard)
@RequireAdminRole(AdminRole.SUPERADMIN)
export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  @Get()
  findAll() {
    return this.adminsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminsService.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateAdminDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.adminsService.create(dto, actingAdmin.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.adminsService.update(id, dto, actingAdmin.id);
  }

  @Patch(':id/deactivate')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.adminsService.deactivate(id, actingAdmin.id);
  }

  @Patch(':id/activate')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.adminsService.activate(id, actingAdmin.id);
  }
}
