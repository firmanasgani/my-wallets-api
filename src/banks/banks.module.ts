import { Module } from '@nestjs/common';
import { BanksService } from './banks.service';
import { BanksController } from './banks.controller';

@Module({
  providers: [BanksService],
  controllers: [BanksController]
})
export class BanksModule {}
