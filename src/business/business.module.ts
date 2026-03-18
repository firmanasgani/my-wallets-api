import { Module } from '@nestjs/common';
import { CompanyModule } from './company/company.module';
import { ChartOfAccountsModule } from './chart-of-accounts/chart-of-accounts.module';

@Module({
  imports: [CompanyModule, ChartOfAccountsModule],
})
export class BusinessModule {}
