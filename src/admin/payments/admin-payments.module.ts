import { Module } from '@nestjs/common';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminPaymentsService } from './admin-payments.service';
import { SubscriptionsModule } from 'src/subscriptions/subscriptions.module';
import { AdminAuthModule } from '../auth/admin-auth.module';

@Module({
  imports: [SubscriptionsModule, AdminAuthModule],
  controllers: [AdminPaymentsController],
  providers: [AdminPaymentsService],
})
export class AdminPaymentsModule {}
