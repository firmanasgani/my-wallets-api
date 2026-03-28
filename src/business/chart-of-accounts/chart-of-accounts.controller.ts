import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Post,
  Patch,
  Body,
  Delete,
} from '@nestjs/common';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { BusinessSubscriptionGuard } from '../guards/business-subscription.guard';
import { CompanyMemberGuard } from '../guards/company-member.guard';
import { CompanyRoleGuard } from '../guards/company-role.guard';
import { RequireCompanyRole } from '../decorators/require-company-role.decorator';
import { GetCompany } from '../decorators/get-company.decorator';
import { Company, CompanyMemberRole } from '@prisma/client';
import { CreateChartOfAccountDto } from './dto/create-chart-of-accounts.dto';
import { UpdateChartOfAccountsDto } from './dto/update-chart-of-accounts.dto';

@Controller('business/chart-of-accounts')
@UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
export class ChartOfAccountsController {
  constructor(private readonly service: ChartOfAccountsService) {}

  @Get()
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  findAll(@GetCompany() company: Company) {
    return this.service.findAll(company);
  }

  @Get(':id')
  @RequireCompanyRole(CompanyMemberRole.VIEWER)
  findById(@GetCompany() company: Company, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(company.id, id);
  }

  @Post()
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  create(@GetCompany() company: Company, @Body() dto: CreateChartOfAccountDto) {
    return this.service.create(company, dto);
  }

  @Patch(':id')
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  update(
    @GetCompany() company: Company,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChartOfAccountsDto,
  ) {
    return this.service.update(company.id, id, dto);
  }

  @Delete(':id')
  @RequireCompanyRole(CompanyMemberRole.ADMIN)
  delete(@GetCompany() company: Company, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(company.id, id);
  }
}
