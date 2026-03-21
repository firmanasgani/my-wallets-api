import { Module } from '@nestjs/common';
import { CompanyModule } from './company/company.module';
import { ChartOfAccountsModule } from './chart-of-accounts/chart-of-accounts.module';
import { MembersModule } from './members/members.module';
import { ContactsModule } from './contacts/contacts.module';
import { InvoicesModule } from './invoices/invoices.module';
import { CompanyBankAccountsModule } from './company-bank-accounts/company-bank-accounts.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    CompanyModule,
    ChartOfAccountsModule,
    MembersModule,
    ContactsModule,
    InvoicesModule,
    CompanyBankAccountsModule,
    TransactionsModule,
  ],
})
export class BusinessModule {}
