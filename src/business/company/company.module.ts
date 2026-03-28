import { Module } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { LogsModule } from '../../logs/logs.module';
import { MinioModule } from '../../common/minio/minio.module';

@Module({
  imports: [PrismaModule, LogsModule, MinioModule],
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
