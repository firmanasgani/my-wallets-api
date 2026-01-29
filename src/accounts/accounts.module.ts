import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { MinioModule } from 'src/common/minio/minio.module';
import { LogsModule } from 'src/logs/logs.module';

@Module({
  imports: [LogsModule],
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
