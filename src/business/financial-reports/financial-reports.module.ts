import { Module } from '@nestjs/common';
import { FinancialReportsController } from './financial-reports.controller';
import { FinancialReportsService } from './financial-reports.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { LogsModule } from '../../logs/logs.module';

@Module({
  imports: [PrismaModule, LogsModule],
  controllers: [FinancialReportsController],
  providers: [FinancialReportsService],
})
export class FinancialReportsModule {}
