import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { AssetDepreciationCron } from './asset-depreciation.cron';
import { PrismaModule } from '../../prisma/prisma.module';
import { LogsModule } from '../../logs/logs.module';

@Module({
  imports: [PrismaModule, LogsModule],
  controllers: [AssetsController],
  providers: [AssetsService, AssetDepreciationCron],
  exports: [AssetsService],
})
export class AssetsModule {}
