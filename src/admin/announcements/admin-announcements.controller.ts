import {
  Body,
  Controller,
  Delete,
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
import { AnnouncementsService } from 'src/announcements/announcements.service';
import { CreateAnnouncementDto } from 'src/announcements/dto/create-announcement.dto';
import { UpdateAnnouncementDto } from 'src/announcements/dto/update-announcement.dto';

@Public()
@Controller('admin/announcements')
@UseGuards(AdminJwtAuthGuard, AdminRoleGuard)
@RequireAdminRole(AdminRole.SALES)
export class AdminAnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  findAll() {
    return this.announcementsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcementsService.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateAnnouncementDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.announcementsService.create(dto, actingAdmin.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.announcementsService.update(id, dto, actingAdmin.id);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.announcementsService.remove(id, actingAdmin.id);
  }
}
