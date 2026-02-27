import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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
  private readonly logger = new Logger(SubscriptionsService.name);

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

    const isProduction =
      this.configService.get<string>('MIDTRANS_IS_PRODUCTION') === 'true';
    const snapUrl = isProduction
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

    const authString = Buffer.from(`${midtransServerKey}:`).toString('base64');

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
    };

    try {
      const response = await fetch(snapUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Basic ${authString}`,
        },
        body: JSON.stringify(payload),
      });

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

      // Log ke Google Sheets (fire-and-forget, tidak memblokir response)
      this.logCheckoutToSheets({
        userId,
        email: user.email,
        fullName: user.fullName || user.username,
        planCode,
        planName: plan.name,
        amount,
        orderId,
      }).catch((err) =>
        this.logger.warn(`[GoogleSheets] Failed to log checkout: ${err.message}`),
      );

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

  async getPaymentHistory(userId: string) {
    return this.prisma.paymentTransaction.findMany({
      where: { userId },
      include: {
        plan: {
          select: {
            name: true,
            code: true,
            price: true,
            durationMonths: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resumePayment(userId: string, orderId: string) {
    const payment = await this.prisma.paymentTransaction.findFirst({
      where: { orderId, userId, status: PaymentStatus.PENDING },
      include: { plan: true },
    });

    if (!payment) {
      throw new NotFoundException(
        'Pending payment not found for the given order ID',
      );
    }

    // Jika snap token masih tersimpan, kembalikan langsung
    if (payment.snapToken) {
      return {
        snap_token: payment.snapToken,
        order_id: payment.orderId,
      };
    }

    // Snap token tidak ada — buat token baru dari Midtrans
    const midtransServerKey = this.configService.get<string>(
      'MIDTRANS_SERVER_KEY',
    );
    if (!midtransServerKey) {
      throw new InternalServerErrorException('Midtrans Server Key not found');
    }

    const isProduction =
      this.configService.get<string>('MIDTRANS_IS_PRODUCTION') === 'true';
    const snapUrl = isProduction
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const authString = Buffer.from(`${midtransServerKey}:`).toString('base64');
    const amount = Number(payment.amount);

    const snapPayload = {
      transaction_details: {
        order_id: payment.orderId,
        gross_amount: amount,
      },
      customer_details: {
        first_name: user.fullName || user.username,
        email: user.email,
      },
      item_details: [
        {
          id: payment.plan.id,
          price: amount,
          quantity: 1,
          name: payment.plan.name,
        },
      ],
    };

    try {
      const response = await fetch(snapUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Basic ${authString}`,
        },
        body: JSON.stringify(snapPayload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error_messages?.[0] || 'Midtrans error');
      }

      await this.prisma.paymentTransaction.update({
        where: { orderId: payment.orderId },
        data: { snapToken: data.token },
      });

      return {
        snap_token: data.token,
        order_id: payment.orderId,
      };
    } catch (error) {
      console.error('Resume Payment Error:', error);
      throw new InternalServerErrorException(
        error.message || 'Failed to resume payment',
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

    console.log(
      `[Midtrans Webhook] Order: ${orderId}, Status: ${transactionStatus}`,
    );
    console.log(`[Midtrans Webhook] Payload Signature: ${signatureKey}`);
    console.log(`[Midtrans Webhook] Server Signature: ${serverSignature}`);
    console.log(
      `[Midtrans Webhook] String to Sign: ${orderId}${statusCode}${grossAmount}${midtransServerKey}`,
    );

    if (!signatureKey) {
      console.log('[Midtrans Webhook] No signature key — treating as test ping, skipping processing.');
      return { status: 'OK' };
    }

    if (serverSignature !== signatureKey) {
      console.warn(
        `[Midtrans Webhook] Invalid Signature! Expected ${serverSignature}, got ${signatureKey}`,
      );
      return { status: 'OK' };
    }

    const payment = await this.prisma.paymentTransaction.findUnique({
      where: { orderId },
      include: { plan: true, user: true },
    });

    if (!payment) {
      console.warn(
        `[Midtrans Webhook] Payment not found for OrderId: ${orderId}`,
      );
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

  /**
   * Handle notifikasi recurring payment dari Midtrans.
   *
   * Recurring notification berbeda dari payment notification biasa:
   * - orderId bisa jadi tidak ada di DB kita (Midtrans generate sendiri untuk auto-charge)
   * - Jika orderId tidak ditemukan, kita cari user via customer_details.email
   *   lalu perpanjang subscription mereka berdasarkan plan yang sedang aktif
   * - Jika orderId ada di DB, proses seperti payment biasa
   *
   * Endpoint ini harus SELALU return 2xx agar Midtrans tidak retry.
   */
  async handleRecurringNotification(payload: any) {
    const {
      order_id: orderId,
      transaction_status: transactionStatus,
      fraud_status: fraudStatus,
      signature_key: signatureKey,
      status_code: statusCode,
      gross_amount: grossAmount,
      customer_details: customerDetails,
    } = payload;

    // Signature verification — same algorithm as payment notification
    const midtransServerKey = this.configService.get<string>('MIDTRANS_SERVER_KEY');
    const serverSignature = crypto
      .createHash('sha512')
      .update(orderId + statusCode + grossAmount + midtransServerKey)
      .digest('hex');

    console.log(`[Recurring Notification] Order: ${orderId}, Status: ${transactionStatus}`);

    if (!signatureKey) {
      console.log(`[Recurring Notification] No signature key — treating as test ping, skipping processing.`);
      return { status: 'OK' };
    }

    if (serverSignature !== signatureKey) {
      console.warn(`[Recurring Notification] Invalid signature for orderId: ${orderId}`);
      return { status: 'OK' };
    }

    // Determine success/failure
    let isSuccess = false;
    let isFailed = false;

    if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
      isSuccess = fraudStatus !== 'challenge';
    } else if (
      transactionStatus === 'cancel' ||
      transactionStatus === 'deny' ||
      transactionStatus === 'expire'
    ) {
      isFailed = true;
    }

    // Cari PaymentTransaction yang sudah ada (jika orderId dibuat sistem kita)
    const existingPayment = await this.prisma.paymentTransaction.findUnique({
      where: { orderId },
      include: { plan: true, user: true },
    });

    if (existingPayment) {
      // orderId ditemukan — proses seperti payment notification biasa
      await this.prisma.paymentTransaction.update({
        where: { orderId },
        data: { status: isSuccess ? PaymentStatus.SUCCESS : isFailed ? PaymentStatus.FAILED : PaymentStatus.PENDING, midtransResponse: payload },
      });

      if (isSuccess) {
        const plan = existingPayment.plan;
        const now = new Date();
        const endDate = plan.durationMonths
          ? new Date(now.getFullYear(), now.getMonth() + plan.durationMonths, now.getDate())
          : null;

        await this.prisma.$transaction([
          this.prisma.userSubscription.updateMany({
            where: { userId: existingPayment.userId, status: SubscriptionStatus.ACTIVE },
            data: { status: SubscriptionStatus.EXPIRED },
          }),
          this.prisma.userSubscription.create({
            data: {
              userId: existingPayment.userId,
              subscriptionPlanId: plan.id,
              status: SubscriptionStatus.ACTIVE,
              startDate: now,
              endDate,
            },
          }),
          this.prisma.log.create({
            data: {
              userId: existingPayment.userId,
              actionType: LogActionType.PAYMENT_SUCCESS,
              entityType: 'PaymentTransaction',
              entityId: existingPayment.id,
              description: `Recurring payment success for order ${orderId}. Subscription renewed to ${plan.name}`,
              details: { orderId, planCode: plan.code },
            },
          }),
        ]);
      } else if (isFailed) {
        await this.logsService.create({
          userId: existingPayment.userId,
          actionType: LogActionType.PAYMENT_FAILED,
          entityType: 'PaymentTransaction',
          entityId: existingPayment.id,
          description: `Recurring payment failed for order ${orderId}. Status: ${transactionStatus}`,
          details: { orderId, transactionStatus },
        });
      }

      return { status: 'OK' };
    }

    // orderId TIDAK ditemukan — ini auto-charge dari Midtrans (orderId generated by Midtrans)
    // Cari user berdasarkan email dari customer_details
    console.log(`[Recurring Notification] No PaymentTransaction found for ${orderId}. Looking up user by email.`);

    const userEmail = customerDetails?.email;
    if (!userEmail) {
      console.warn(`[Recurring Notification] No customer email in payload for orderId: ${orderId}`);
      await this.logsService.create({
        actionType: LogActionType.SUBSCRIPTION_WEBHOOK,
        entityType: 'RecurringPayment',
        entityId: orderId,
        description: `Recurring notification received but no customer email found. orderId: ${orderId}`,
        details: payload,
      });
      return { status: 'OK' };
    }

    const user = await this.prisma.user.findUnique({
      where: { email: userEmail },
      include: {
        subscriptions: {
          where: { status: SubscriptionStatus.ACTIVE },
          include: { plan: true },
          take: 1,
        },
      },
    });

    if (!user) {
      console.warn(`[Recurring Notification] User not found for email: ${userEmail}`);
      await this.logsService.create({
        actionType: LogActionType.SUBSCRIPTION_WEBHOOK,
        entityType: 'RecurringPayment',
        entityId: orderId,
        description: `Recurring notification received but user not found for email: ${userEmail}`,
        details: payload,
      });
      return { status: 'OK' };
    }

    const activePlan = user.subscriptions[0]?.plan;

    if (!activePlan) {
      console.warn(`[Recurring Notification] No active plan for user: ${user.id}`);
      await this.logsService.create({
        userId: user.id,
        actionType: LogActionType.SUBSCRIPTION_WEBHOOK,
        entityType: 'RecurringPayment',
        entityId: orderId,
        description: `Recurring notification received but user has no active plan. orderId: ${orderId}`,
        details: payload,
      });
      return { status: 'OK' };
    }

    // Buat PaymentTransaction record untuk recurring charge ini
    const newPayment = await this.prisma.paymentTransaction.create({
      data: {
        orderId,
        userId: user.id,
        planId: activePlan.id,
        amount: parseFloat(grossAmount),
        status: isSuccess ? PaymentStatus.SUCCESS : isFailed ? PaymentStatus.FAILED : PaymentStatus.PENDING,
        midtransResponse: payload,
      },
    });

    if (isSuccess) {
      const now = new Date();
      const endDate = activePlan.durationMonths
        ? new Date(now.getFullYear(), now.getMonth() + activePlan.durationMonths, now.getDate())
        : null;

      await this.prisma.$transaction([
        this.prisma.userSubscription.updateMany({
          where: { userId: user.id, status: SubscriptionStatus.ACTIVE },
          data: { status: SubscriptionStatus.EXPIRED },
        }),
        this.prisma.userSubscription.create({
          data: {
            userId: user.id,
            subscriptionPlanId: activePlan.id,
            status: SubscriptionStatus.ACTIVE,
            startDate: now,
            endDate,
          },
        }),
        this.prisma.log.create({
          data: {
            userId: user.id,
            actionType: LogActionType.PAYMENT_SUCCESS,
            entityType: 'PaymentTransaction',
            entityId: newPayment.id,
            description: `Auto-recurring payment success for order ${orderId}. Subscription renewed to ${activePlan.name}`,
            details: { orderId, planCode: activePlan.code },
          },
        }),
      ]);
    } else if (isFailed) {
      await this.logsService.create({
        userId: user.id,
        actionType: LogActionType.PAYMENT_FAILED,
        entityType: 'PaymentTransaction',
        entityId: newPayment.id,
        description: `Auto-recurring payment failed for order ${orderId}. Subscription may expire soon.`,
        details: { orderId, transactionStatus },
      });
    }

    return { status: 'OK' };
  }

  /**
   * Handle notifikasi dari Midtrans ketika user berhasil/gagal linking/unlinking akun GoPay.
   *
   * Midtrans mengirim payload dengan field:
   * - account_id     : ID akun GoPay di sisi Midtrans
   * - customer_id    : ID user di sistem kita (userId yang dikirim saat buat token GoPay)
   * - payment_type   : "gopay"
   * - account_status : "ENABLED" (linked) | "DISABLED" (unlinked)
   *
   * Endpoint harus selalu return 2xx agar Midtrans tidak retry.
   */
  async handleGopayLinkNotification(payload: any) {
    const {
      account_id: accountId,
      customer_id: customerId,
      payment_type: paymentType,
      account_status: accountStatus,
    } = payload;

    console.log(
      `[GoPay Link Notification] customer: ${customerId}, account: ${accountId}, status: ${accountStatus}`,
    );

    try {
      await this.logsService.create({
        userId: customerId ?? null,
        actionType: LogActionType.SUBSCRIPTION_WEBHOOK,
        entityType: 'GopayAccount',
        entityId: accountId ?? 'unknown',
        description: `GoPay account ${accountStatus} for customer ${customerId} (payment_type: ${paymentType})`,
        details: payload,
      });
    } catch (err) {
      // Jangan lempar error — Midtrans akan retry jika response bukan 2xx
      console.error('[GoPay Link Notification] Failed to write log:', err);
    }

    return { status: 'OK' };
  }

  private async logCheckoutToSheets(data: {
    userId: string;
    email: string;
    fullName: string;
    planCode: string;
    planName: string;
    amount: number;
    orderId: string;
  }) {
    const webhookUrl = this.configService.get<string>('GOOGLE_SHEETS_WEBHOOK_URL');
    if (!webhookUrl) return;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  @Cron('0 1 * * *')
  async expirePendingPayments() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    this.logger.log(`[ExpirePendingPayments] Marking PENDING payments older than ${oneDayAgo.toISOString()} as FAILED.`);

    const stale = await this.prisma.paymentTransaction.findMany({
      where: {
        status: PaymentStatus.PENDING,
        createdAt: { lt: oneDayAgo },
      },
      select: { id: true, userId: true, orderId: true },
    });

    if (stale.length === 0) {
      this.logger.log('[ExpirePendingPayments] No stale pending payments found.');
      return;
    }

    const ids = stale.map((p) => p.id);

    await this.prisma.paymentTransaction.updateMany({
      where: { id: { in: ids } },
      data: { status: PaymentStatus.FAILED },
    });

    await this.prisma.log.createMany({
      data: stale.map((p) => ({
        userId: p.userId,
        actionType: LogActionType.PAYMENT_FAILED,
        entityType: 'PaymentTransaction',
        entityId: p.id,
        description: `Payment ${p.orderId} auto-failed: still PENDING after 24 hours.`,
        details: { orderId: p.orderId },
      })),
    });

    this.logger.log(`[ExpirePendingPayments] Marked ${ids.length} payment(s) as FAILED: ${ids.join(', ')}`);
  }

  @Cron('0 1 * * *')
  async expireSubscriptions() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    this.logger.log(`[ExpireSubscriptions] Running at ${now.toISOString()}. Checking endDate in range [${startOfYesterday.toISOString()}, ${startOfToday.toISOString()})`);

    const expired = await this.prisma.userSubscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        endDate: {
          gte: startOfYesterday,
          lt: startOfToday,
        },
      },
      select: { id: true, userId: true },
    });

    if (expired.length === 0) {
      this.logger.log('[ExpireSubscriptions] No subscriptions to expire.');
      return;
    }

    const ids = expired.map((s) => s.id);

    await this.prisma.userSubscription.updateMany({
      where: { id: { in: ids } },
      data: { status: SubscriptionStatus.EXPIRED },
    });

    await this.prisma.log.createMany({
      data: expired.map((s) => ({
        userId: s.userId,
        actionType: LogActionType.SUBSCRIPTION_WEBHOOK,
        entityType: 'UserSubscription',
        entityId: s.id,
        description: 'Subscription expired automatically via scheduled job.',
        details: {},
      })),
    });

    this.logger.log(`[ExpireSubscriptions] Expired ${ids.length} subscription(s): ${ids.join(', ')}`);
  }
}
