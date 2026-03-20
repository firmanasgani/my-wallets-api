import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CompanyBankAccountsService } from './company-bank-accounts.service';
import { BusinessSubscriptionGuard } from '../guards/business-subscription.guard';
import { CompanyMemberGuard } from '../guards/company-member.guard';
import { CompanyRoleGuard } from '../guards/company-role.guard';
import { RequireCompanyRole } from '../decorators/require-company-role.decorator';
import { GetCompany } from '../decorators/get-company.decorator';
import { Company, CompanyMemberRole } from '@prisma/client';
import { CreateCompanyBankAccountDto } from './dto/create-company-bank-account.dto';
import { UpdateCompanyBankAccountDto } from './dto/update-company-bank-account.dto';

@Controller('business/bank-accounts')
@UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
export class CompanyBankAccountsController {
  constructor(private readonly service: CompanyBankAccountsService) {}

  @Get()
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  findAll(@GetCompany() company: Company) {
    return this.service.findAll(company);
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
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  create(@GetCompany() company: Company, @Body() dto: CreateCompanyBankAccountDto) {
    return this.service.create(company, dto);
  }

  @Put(':id')
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  update(
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyBankAccountDto,
  ) {
    return this.service.update(company.id, id, dto);
  }

  @Patch(':id/set-default')
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  setDefault(
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.setDefault(company.id, id);
  }

  @Delete(':id')
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  delete(
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.delete(company.id, id);
  }
}
