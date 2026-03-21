import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Company, CompanyMemberRole } from '@prisma/client';
import { FinancialReportsService } from './financial-reports.service';
import { DateRangeQueryDto } from './dto/date-range-query.dto';
import { BalanceSheetQueryDto } from './dto/balance-sheet-query.dto';
import { JournalQueryDto } from './dto/journal-query.dto';
import { BusinessSubscriptionGuard } from '../guards/business-subscription.guard';
import { CompanyMemberGuard } from '../guards/company-member.guard';
import { CompanyRoleGuard } from '../guards/company-role.guard';
import { RequireCompanyRole } from '../decorators/require-company-role.decorator';
import { GetCompany } from '../decorators/get-company.decorator';

@Controller('business/reports')
@UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
@RequireCompanyRole(CompanyMemberRole.VIEWER)
export class FinancialReportsController {
  constructor(private readonly service: FinancialReportsService) {}

  @Get('profit-loss')
  getProfitLoss(
    @GetCompany() company: Company,
    @Query() query: DateRangeQueryDto,
  ) {
    return this.service.getProfitLoss(company, query);
  }

  @Get('balance-sheet')
  getBalanceSheet(
    @GetCompany() company: Company,
    @Query() query: BalanceSheetQueryDto,
  ) {
    return this.service.getBalanceSheet(company, query);
  }

  @Get('cash-flow')
  getCashFlow(
    @GetCompany() company: Company,
    @Query() query: DateRangeQueryDto,
  ) {
    return this.service.getCashFlow(company, query);
  }

  @Get('journal')
  getJournal(
    @GetCompany() company: Company,
    @Query() query: JournalQueryDto,
  ) {
    return this.service.getJournal(company, query);
  }
}
