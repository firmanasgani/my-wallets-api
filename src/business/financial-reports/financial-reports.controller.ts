import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Company, CompanyMemberRole, LogActionType, User } from '@prisma/client';
import { FinancialReportsService } from './financial-reports.service';
import { DateRangeQueryDto } from './dto/date-range-query.dto';
import { BalanceSheetQueryDto } from './dto/balance-sheet-query.dto';
import { JournalQueryDto } from './dto/journal-query.dto';
import { BusinessSubscriptionGuard } from '../guards/business-subscription.guard';
import { CompanyMemberGuard } from '../guards/company-member.guard';
import { CompanyRoleGuard } from '../guards/company-role.guard';
import { RequireCompanyRole } from '../decorators/require-company-role.decorator';
import { GetCompany } from '../decorators/get-company.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { LogsService } from '../../logs/logs.service';

@Controller('business/reports')
@UseGuards(BusinessSubscriptionGuard, CompanyMemberGuard, CompanyRoleGuard)
@RequireCompanyRole(CompanyMemberRole.VIEWER)
export class FinancialReportsController {
  constructor(
    private readonly service: FinancialReportsService,
    private readonly logsService: LogsService,
  ) {}

  @Get('profit-loss')
  async getProfitLoss(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Query() query: DateRangeQueryDto,
  ) {
    const result = await this.service.getProfitLoss(company, query);
    await this.logsService.create({
      userId: user.id,
      actionType: LogActionType.BUSINESS_REPORT_EXPORT,
      entityType: 'Company',
      entityId: company.id,
      description: `Report Profit & Loss exported for company "${company.name}".`,
      details: { reportType: 'profit-loss', ...query },
    });
    return result;
  }

  @Get('balance-sheet')
  async getBalanceSheet(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Query() query: BalanceSheetQueryDto,
  ) {
    const result = await this.service.getBalanceSheet(company, query);
    await this.logsService.create({
      userId: user.id,
      actionType: LogActionType.BUSINESS_REPORT_EXPORT,
      entityType: 'Company',
      entityId: company.id,
      description: `Report Balance Sheet exported for company "${company.name}".`,
      details: { reportType: 'balance-sheet', ...query },
    });
    return result;
  }

  @Get('cash-flow')
  async getCashFlow(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Query() query: DateRangeQueryDto,
  ) {
    const result = await this.service.getCashFlow(company, query);
    await this.logsService.create({
      userId: user.id,
      actionType: LogActionType.BUSINESS_REPORT_EXPORT,
      entityType: 'Company',
      entityId: company.id,
      description: `Report Cash Flow exported for company "${company.name}".`,
      details: { reportType: 'cash-flow', ...query },
    });
    return result;
  }

  @Get('journal')
  async getJournal(
    @GetUser() user: User,
    @GetCompany() company: Company,
    @Query() query: JournalQueryDto,
  ) {
    const result = await this.service.getJournal(company, query);
    await this.logsService.create({
      userId: user.id,
      actionType: LogActionType.BUSINESS_REPORT_EXPORT,
      entityType: 'Company',
      entityId: company.id,
      description: `Report Journal (Jurnal Umum) exported for company "${company.name}".`,
      details: { reportType: 'journal', ...query },
    });
    return result;
  }
}
