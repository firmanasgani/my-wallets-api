import { Controller, Get, UseGuards } from '@nestjs/common';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { BusinessSubscriptionGuard } from '../guards/business-subscription.guard';
import { CompanyMemberGuard } from '../guards/company-member.guard';
import { CompanyRoleGuard } from '../guards/company-role.guard';
import { GetCompany } from '../decorators/get-company.decorator';
import { Company } from '@prisma/client';

@Controller('business/chart-of-accounts')
@UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
export class ChartOfAccountsController {
  constructor(private readonly service: ChartOfAccountsService) {}

  @Get()
  findAll(@GetCompany() company: Company) {
    return this.service.findAll(company);
  }
}
