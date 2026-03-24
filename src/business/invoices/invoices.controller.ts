import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InvoicesService } from './invoices.service';
import { BusinessSubscriptionGuard } from '../guards/business-subscription.guard';
import { CompanyMemberGuard } from '../guards/company-member.guard';
import { CompanyRoleGuard } from '../guards/company-role.guard';
import { RequireCompanyRole } from '../decorators/require-company-role.decorator';
import { GetCompany } from '../decorators/get-company.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Company, CompanyMemberRole, InvoiceStatus, User } from '@prisma/client';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';

@Controller('business/invoices')
@UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  findAll(
    @GetCompany() company: Company,
    @Query('status') status?: InvoiceStatus,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('contactId') contactId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(
      company,
      status,
      search,
      startDate,
      endDate,
      contactId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  findById(
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findById(company.id, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  create(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.service.create(user.id, company, dto);
  }

  @Put(':id')
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  update(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.service.update(user.id, company.id, id, dto);
  }

  @Delete(':id')
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  delete(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.delete(user.id, company.id, id);
  }

  @Post(':id/send')
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  send(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.send(user.id, company.id, id);
  }

  @Post(':id/pay')
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  pay(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayInvoiceDto,
  ) {
    return this.service.pay(user.id, company.id, id, dto);
  }

  @Post(':id/send-email')
  @HttpCode(HttpStatus.OK)
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  sendEmail(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.sendEmail(user.id, company.id, id);
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  duplicate(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.duplicate(user.id, company, id);
  }

  // ── Attachments ──

  @Get(':id/attachments')
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  getAttachments(
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getAttachments(company.id, id);
  }

  @Post(':id/attachments')
  @HttpCode(HttpStatus.CREATED)
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  @UseInterceptors(FileInterceptor('file'))
  uploadAttachment(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return this.service.uploadAttachment(user.id, company.id, id, file);
  }

  @Delete(':id/attachments/:attachmentId')
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  deleteAttachment(
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.service.deleteAttachment(company.id, id, attachmentId);
  }
}
