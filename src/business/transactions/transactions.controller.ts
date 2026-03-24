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
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Company, CompanyMember, CompanyMemberRole, User } from '@prisma/client';
import { TransactionsService } from './transactions.service';
import { CreateJournalEntryDto } from './dto/create-transaction.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { RejectEntryDto } from './dto/reject-entry.dto';
import { BusinessSubscriptionGuard } from '../guards/business-subscription.guard';
import { CompanyMemberGuard } from '../guards/company-member.guard';
import { CompanyRoleGuard } from '../guards/company-role.guard';
import { RequireCompanyRole } from '../decorators/require-company-role.decorator';
import { GetCompany } from '../decorators/get-company.decorator';
import { GetCompanyMember } from '../decorators/get-company-member.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';

@Controller('business/transactions')
@UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  // ─── Core CRUD ────────────────────────────────────────────────────────────

  @Get()
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  findAll(@GetCompany() company: Company, @Query() query: ListTransactionsDto) {
    return this.service.findAll(company, query);
  }

  @Get(':id')
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  findOne(
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(company, id);
  }

  @Post()
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  @UseInterceptors(FilesInterceptor('files', 5))
  async create(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Body('data') rawData: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData ?? '');
    } catch {
      throw new BadRequestException('Field "data" must be a valid JSON string.');
    }
    const dto = plainToInstance(CreateJournalEntryDto, parsed);
    const errors = await validate(dto, { whitelist: true });
    if (errors.length > 0) {
      throw new BadRequestException(errors.flatMap((e) => Object.values(e.constraints ?? {})));
    }
    return this.service.create(user.id, company, dto, files ?? []);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  remove(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(user.id, company, id);
  }

  // ─── Approval Workflow ────────────────────────────────────────────────────

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  submit(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @GetCompanyMember() member: CompanyMember,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.submit(user.id, company, member, id);
  }

  @Post(':id/check')
  @HttpCode(HttpStatus.OK)
  @RequireCompanyRole(CompanyMemberRole.CHECKER)
  check(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @GetCompanyMember() member: CompanyMember,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.check(user.id, company, member, id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  approve(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @GetCompanyMember() member: CompanyMember,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.approve(user.id, company, member, id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequireCompanyRole(CompanyMemberRole.CHECKER)
  reject(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @GetCompanyMember() member: CompanyMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectEntryDto,
  ) {
    return this.service.reject(user.id, company, member, id, dto);
  }

  // ─── Attachments ──────────────────────────────────────────────────────────

  @Get(':id/attachments')
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  listAttachments(
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.listAttachments(company, id);
  }

  @Post(':id/attachments')
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  @UseInterceptors(FileInterceptor('file'))
  uploadAttachment(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @GetCompanyMember() member: CompanyMember,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadAttachment(user.id, company, member, id, file);
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.OK)
  @RequireCompanyRole(CompanyMemberRole.STAFF)
  deleteAttachment(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @GetCompanyMember() member: CompanyMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.service.deleteAttachment(user.id, company, member, id, attachmentId);
  }
}
