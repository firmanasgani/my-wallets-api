import {
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
  UseGuards,
} from '@nestjs/common';
import { Company, CompanyMemberRole, User } from '@prisma/client';
import { TransactionsService } from './transactions.service';
import { CreateJournalEntryDto } from './dto/create-transaction.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { BusinessSubscriptionGuard } from '../guards/business-subscription.guard';
import { CompanyMemberGuard } from '../guards/company-member.guard';
import { CompanyRoleGuard } from '../guards/company-role.guard';
import { RequireCompanyRole } from '../decorators/require-company-role.decorator';
import { GetCompany } from '../decorators/get-company.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';

@Controller('business/transactions')
@UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Get()
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  findAll(
    @GetCompany() company: Company,
    @Query() query: ListTransactionsDto,
  ) {
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
  create(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Body() dto: CreateJournalEntryDto,
  ) {
    return this.service.create(user.id, company, dto);
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
}
