import { Controller, Get, UseGuards } from '@nestjs/common';
import { Company, CompanyMemberRole } from '@prisma/client';
import { KpiService } from './kpi.service';
import { BusinessSubscriptionGuard } from '../guards/business-subscription.guard';
import { CompanyMemberGuard } from '../guards/company-member.guard';
import { CompanyRoleGuard } from '../guards/company-role.guard';
import { RequireCompanyRole } from '../decorators/require-company-role.decorator';
import { GetCompany } from '../decorators/get-company.decorator';

@Controller('business/kpi')
@UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
@RequireCompanyRole(CompanyMemberRole.VIEWER)
export class KpiController {
  constructor(private readonly service: KpiService) {}

  @Get()
  getKpiDashboard(@GetCompany() company: Company) {
    return this.service.getKpiDashboard(company);
  }
}
