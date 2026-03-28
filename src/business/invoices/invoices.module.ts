import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceOverdueCron } from './invoice-overdue.cron';
import { PrismaModule } from '../../prisma/prisma.module';
import { LogsModule } from '../../logs/logs.module';
import { MinioModule } from '../../common/minio/minio.module';

@Module({
  imports: [PrismaModule, LogsModule, MinioModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceOverdueCron],
  exports: [InvoicesService],
})
export class InvoicesModule {}
