import { Module } from '@nestjs/common';
import { TaxController } from './tax.controller';
import { TaxService } from './tax.service';
import { TaxSuggestionService } from './tax-suggestion.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { LogsModule } from '../../logs/logs.module';

@Module({
  imports: [PrismaModule, LogsModule],
  controllers: [TaxController],
  providers: [TaxService, TaxSuggestionService],
  exports: [TaxService, TaxSuggestionService],
})
export class TaxModule {}
