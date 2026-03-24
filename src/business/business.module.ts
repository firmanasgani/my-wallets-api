import { Module } from '@nestjs/common';
import { CompanyModule } from './company/company.module';
import { ChartOfAccountsModule } from './chart-of-accounts/chart-of-accounts.module';
import { MembersModule } from './members/members.module';
import { ContactsModule } from './contacts/contacts.module';
import { InvoicesModule } from './invoices/invoices.module';
import { CompanyBankAccountsModule } from './company-bank-accounts/company-bank-accounts.module';
import { TransactionsModule } from './transactions/transactions.module';
import { FinancialReportsModule } from './financial-reports/financial-reports.module';
import { KpiModule } from './kpi/kpi.module';
// Phase 8
import { TaxModule } from './tax/tax.module';
import { AssetsModule } from './assets/assets.module';

@Module({
  imports: [
    CompanyModule,
    ChartOfAccountsModule,
    MembersModule,
    ContactsModule,
    InvoicesModule,
    CompanyBankAccountsModule,
    TransactionsModule,
    FinancialReportsModule,
    KpiModule,
    // Phase 8
    TaxModule,
    AssetsModule,
  ],
})
export class BusinessModule {}
