import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User, TransactionType } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  getSummary(
    @GetUser() user: User,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getSummary(user.id, startDate, endDate);
  }

  @Get('category-breakdown')
  getCategoryBreakdown(
    @GetUser() user: User,
    @Query('type') type?: TransactionType,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getCategoryBreakdown(
      user.id,
      type,
      startDate,
      endDate,
    );
  }

  @Get('trend')
  getTrend(
    @GetUser() user: User,
    @Query('interval') interval?: 'DAY' | 'MONTH',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: TransactionType,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.reportsService.getTrend(
      user.id,
      interval,
      startDate,
      endDate,
      type,
      categoryId,
    );
  }

  @Get('category-trend')
  getCategoryTrend(
    @GetUser() user: User,
    @Query('type') type: TransactionType,
    @Query('interval') interval?: 'DAY' | 'MONTH',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Basic validation
    if (!type) throw new Error('Query param "type" is required');
    return this.reportsService.getCategoryTrend(
      user.id,
      type,
      interval,
      startDate,
      endDate,
    );
  }

  @Get('comparison')
  getComparison(
    @GetUser() user: User,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
    @Query('target') target?: 'ALL' | 'INCOME' | 'EXPENSE',
  ) {
    return this.reportsService.getComparison(user.id, month, year, target);
  }

  @Get('budget-health')
  getBudgetHealth(
    @GetUser() user: User,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.reportsService.getBudgetHealth(user.id, month, year);
  }

  @Get('insights')
  getInsights(
    @GetUser() user: User,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.reportsService.getInsights(user.id, month, year);
  }
}
