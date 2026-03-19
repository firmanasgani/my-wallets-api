import { Controller, Get, Param, UseGuards, Post, Patch, Body, Delete } from '@nestjs/common';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { BusinessSubscriptionGuard } from '../guards/business-subscription.guard';
import { CompanyMemberGuard } from '../guards/company-member.guard';
import { CompanyRoleGuard } from '../guards/company-role.guard';
import { GetCompany } from '../decorators/get-company.decorator';
import { Company } from '@prisma/client';
import { CreateChartOfAccountDto } from './dto/create-chart-of-accounts.dto';
import { UpdateChartOfAccountsDto } from './dto/update-chart-of-accounts.dto';

@Controller('business/chart-of-accounts')
@UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
export class ChartOfAccountsController {
  constructor(private readonly service: ChartOfAccountsService) {}

  @Get()
  findAll(@GetCompany() company: Company) {
    return this.service.findAll(company);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  create(@GetCompany() company: Company, @Body() dto: CreateChartOfAccountDto) {
    return this.service.create(company, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateChartOfAccountsDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
