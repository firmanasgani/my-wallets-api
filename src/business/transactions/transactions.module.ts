import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { LogsModule } from '../../logs/logs.module';
import { MinioModule } from '../../common/minio/minio.module';

@Module({
  imports: [PrismaModule, LogsModule, MinioModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
