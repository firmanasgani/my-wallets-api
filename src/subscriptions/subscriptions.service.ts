import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { LogsService } from '../logs/logs.service';
import {
  LogActionType,
  PaymentStatus,
  SubscriptionStatus,
} from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class SubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private logsService: LogsService,
  ) {}

  async getPlans() {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: {
        price: 'asc',
      },
    });
  }

  async getPlanByCode(code: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { code },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async createCheckoutToken(userId: string, planCode: string) {
    const plan = await this.getPlanByCode(planCode);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const orderId = `SUB-${userId.substring(0, 8)}-${Date.now()}`;
    const amount = Number(plan.discountPrice || plan.price);

    const midtransServerKey = this.configService.get<string>(
      'MIDTRANS_SERVER_KEY',
    );
    if (!midtransServerKey) {
      throw new InternalServerErrorException('Midtrans Server Key not found');
    }

    const authString = Buffer.from(`${midtransServerKey}:`).toString('base64');

    const apiUrl = this.configService.get<string>('API_URL');
    const payload = {
      transaction_details: {
        order_id: orderId,
        gross_amount: amount,
      },
      customer_details: {
        first_name: user.fullName || user.username,
        email: user.email,
      },
      item_details: [
        {
          id: plan.id,
          price: amount,
          quantity: 1,
          name: plan.name,
        },
      ],
      callbacks: {
        finish: `${apiUrl}/notification/finish`,
        unfinish: `${apiUrl}/notification/unfinish`,
        error: `${apiUrl}/notification/error`,
      },
    };

    try {
      const response = await fetch(
        'https://app.sandbox.midtrans.com/snap/v1/transactions',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Basic ${authString}`,
          },
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error_messages?.[0] || 'Midtrans error');
      }

      // Record transaction
      await this.prisma.paymentTransaction.create({
        data: {
          orderId,
          userId,
          planId: plan.id,
          amount,
          snapToken: data.token,
          status: PaymentStatus.PENDING,
        },
      });

      // Log
      await this.logsService.create({
        userId,
        actionType: LogActionType.SUBSCRIPTION_CHECKOUT,
        entityType: 'SubscriptionPlan',
        entityId: plan.id,
        description: `User initiated checkout for ${plan.name}`,
        details: { orderId, planCode, amount },
      });

      return {
        snap_token: data.token,
        redirect_url: data.redirect_url,
      };
    } catch (error) {
      console.error('Midtrans Checkout Error:', error);
      throw new InternalServerErrorException(
        error.message || 'Failed to initiate payment',
      );
    }
  }

  async handleMidtransWebhook(payload: any) {
    const {
      order_id: orderId,
      transaction_status: transactionStatus,
      fraud_status: fraudStatus,
      signature_key: signatureKey,
      status_code: statusCode,
      gross_amount: grossAmount,
    } = payload;

    // Signature Key Verification
    const midtransServerKey = this.configService.get<string>(
      'MIDTRANS_SERVER_KEY',
    );
    const serverSignature = crypto
      .createHash('sha512')
      .update(orderId + statusCode + grossAmount + midtransServerKey)
      .digest('hex');

    if (serverSignature !== signatureKey) {
      throw new BadRequestException('Invalid signature');
    }

    const payment = await this.prisma.paymentTransaction.findUnique({
      where: { orderId },
      include: { plan: true, user: true },
    });

    if (!payment) {
      return { status: 'OK', message: 'Payment not found' };
    }

    let status: PaymentStatus = PaymentStatus.PENDING;

    if (
      transactionStatus === 'capture' ||
      transactionStatus === 'settlement' ||
      transactionStatus === 'settlement'
    ) {
      if (fraudStatus === 'challenge') {
        status = PaymentStatus.PENDING;
      } else {
        status = PaymentStatus.SUCCESS;
      }
    } else if (
      transactionStatus === 'cancel' ||
      transactionStatus === 'deny' ||
      transactionStatus === 'expire'
    ) {
      status = PaymentStatus.FAILED;
    } else if (transactionStatus === 'pending') {
      status = PaymentStatus.PENDING;
    }

    // Update payment record
    await this.prisma.paymentTransaction.update({
      where: { orderId },
      data: {
        status,
        midtransResponse: payload,
      },
    });

    if (status === PaymentStatus.SUCCESS) {
      // Handle Success: Update user subscription
      const plan = payment.plan;
      const now = new Date();
      let endDate: Date | null = null;

      if (plan.durationMonths) {
        endDate = new Date();
        endDate.setMonth(now.getMonth() + plan.durationMonths);
      }

      await this.prisma.$transaction([
        // Deactivate old active subscriptions
        this.prisma.userSubscription.updateMany({
          where: { userId: payment.userId, status: SubscriptionStatus.ACTIVE },
          data: { status: SubscriptionStatus.EXPIRED },
        }),
        // Create new subscription
        this.prisma.userSubscription.create({
          data: {
            userId: payment.userId,
            subscriptionPlanId: plan.id,
            status: SubscriptionStatus.ACTIVE,
            startDate: now,
            endDate,
          },
        }),
        // Log Success
        this.prisma.log.create({
          data: {
            userId: payment.userId,
            actionType: LogActionType.PAYMENT_SUCCESS,
            entityType: 'PaymentTransaction',
            entityId: payment.id,
            description: `Payment success for order ${orderId}. Plan upgraded to ${plan.name}`,
            details: { orderId, planCode: plan.code },
          },
        }),
      ]);
    } else if (status === PaymentStatus.FAILED) {
      // Log Failure
      await this.logsService.create({
        userId: payment.userId,
        actionType: LogActionType.PAYMENT_FAILED,
        entityType: 'PaymentTransaction',
        entityId: payment.id,
        description: `Payment failed for order ${orderId}. Status: ${transactionStatus}`,
        details: { orderId, transactionStatus },
      });
    }

    return { status: 'OK' };
  }
}
