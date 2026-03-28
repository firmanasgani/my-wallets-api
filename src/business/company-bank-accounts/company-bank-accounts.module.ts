import { Module } from '@nestjs/common';
import { CompanyBankAccountsController } from './company-bank-accounts.controller';
import { CompanyBankAccountsService } from './company-bank-accounts.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CompanyBankAccountsController],
  providers: [CompanyBankAccountsService],
  exports: [CompanyBankAccountsService],
})
export class CompanyBankAccountsModule {}
