import { Injectable } from '@nestjs/common';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { SubscriptionsService } from 'src/subscriptions/subscriptions.service';

@Injectable()
export class AdminPaymentsService {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  listPayments(params: {
    page?: number;
    limit?: number;
    status?: PaymentStatus;
    method?: PaymentMethod;
    planId?: string;
  }) {
    return this.subscriptionsService.listPayments(params);
  }

  approve(paymentId: string, adminId: string) {
    return this.subscriptionsService.approveManualPayment(paymentId, adminId);
  }

  reject(paymentId: string, adminId: string, reason?: string) {
    return this.subscriptionsService.rejectManualPayment(
      paymentId,
      adminId,
      reason,
    );
  }
}
