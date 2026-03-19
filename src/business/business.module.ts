import { Module } from '@nestjs/common';
import { CompanyModule } from './company/company.module';
import { ChartOfAccountsModule } from './chart-of-accounts/chart-of-accounts.module';
import { MembersModule } from './members/members.module';

@Module({
  imports: [CompanyModule, ChartOfAccountsModule, MembersModule],
})
export class BusinessModule {}
