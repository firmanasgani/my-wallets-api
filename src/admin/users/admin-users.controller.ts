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
import { Admin, AdminRole } from '@prisma/client';
import { AdminUsersService } from './admin-users.service';
import { DeactivateUserDto } from './dto/deactivate-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Public()
@Controller('admin/users')
@UseGuards(AdminJwtAuthGuard, AdminRoleGuard)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('segment') segment?: 'active_subscribers' | 'free',
  ) {
    return this.adminUsersService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      segment,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminUsersService.findOne(id);
  }

  @Patch(':id/deactivate')
  @RequireAdminRole(AdminRole.SALES)
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeactivateUserDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.adminUsersService.deactivate(id, actingAdmin.id, dto.reason);
  }

  @Patch(':id/activate')
  @RequireAdminRole(AdminRole.SALES)
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.adminUsersService.activate(id, actingAdmin.id);
  }

  @Patch(':id/reset-password')
  @RequireAdminRole(AdminRole.SALES)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.adminUsersService.resetPassword(
      id,
      actingAdmin.id,
      dto.newPassword,
    );
  }
}
