import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { AdminAuthModule } from '../auth/admin-auth.module';

@Module({
  imports: [AdminAuthModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
