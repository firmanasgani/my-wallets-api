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
import { EmailBlastsService } from './email-blasts.service';
import { CreateEmailBlastDto } from './dto/create-email-blast.dto';
import { UpdateEmailBlastDto } from './dto/update-email-blast.dto';

@Public()
@Controller('admin/email-blasts')
@UseGuards(AdminJwtAuthGuard, AdminRoleGuard)
@RequireAdminRole(AdminRole.SALES)
export class AdminEmailBlastsController {
  constructor(private readonly emailBlastsService: EmailBlastsService) {}

  @Get()
  findAll() {
    return this.emailBlastsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.emailBlastsService.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateEmailBlastDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.emailBlastsService.create(dto, actingAdmin.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmailBlastDto,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.emailBlastsService.update(id, dto, actingAdmin.id);
  }

  @Post(':id/unschedule')
  unschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.emailBlastsService.unschedule(id, actingAdmin.id);
  }

  @Post(':id/send-now')
  sendNow(@Param('id', ParseUUIDPipe) id: string) {
    return this.emailBlastsService.sendNow(id);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() actingAdmin: Omit<Admin, 'passwordHash'>,
  ) {
    return this.emailBlastsService.remove(id, actingAdmin.id);
  }
}
