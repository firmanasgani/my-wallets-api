import { Controller, Post, Body, Get, Query, Redirect } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('notification')
export class MidtransNotificationController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Payment Notification URL
   * Midtrans dashboard → Settings → Configuration → Payment Notification URL
   * Set to: https://your-domain.com/notification
   */
  @Public()
  @Post()
  async handleNotification(@Body() body: any) {
    return this.subscriptionsService.handleMidtransWebhook(body);
  }

  /**
   * Recurring Payment Notification URL
   * Midtrans dashboard → Settings → Configuration → Recurring Notification URL
   * Set to: https://your-domain.com/notification/recurring
   *
   * Dipanggil Midtrans saat auto-charge recurring subscription berhasil atau gagal.
   * Handler bisa menerima orderId yang ada di DB (pre-created) maupun
   * orderId yang di-generate Midtrans (true auto-recurring charge).
   */
  @Public()
  @Post('recurring')
  async handleRecurringNotification(@Body() body: any) {
    return this.subscriptionsService.handleRecurringNotification(body);
  }

  /**
   * GoPay Account Linking Notification URL
   * Midtrans dashboard → Settings → Configuration → Pay Account Notification URL
   * Set to: https://your-domain.com/notification/pay-account
   *
   * Dipanggil Midtrans saat user berhasil/gagal linking atau unlinking akun GoPay.
   */
  @Public()
  @Post('pay-account')
  async handleGopayLinkNotification(@Body() body: any) {
    return this.subscriptionsService.handleGopayLinkNotification(body);
  }

  @Public()
  @Get('finish')
  @Redirect()
  async handleFinish(@Query() query: any) {
    const frontendUrl = 'https://my-wallets.firmanasgani.id';
    return {
      url: `${frontendUrl}/payment/finish?order_id=${query.order_id}&status_code=${query.status_code}&transaction_status=${query.transaction_status}`,
    };
  }

  @Public()
  @Get('unfinish')
  @Redirect()
  async handleUnfinish(@Query() query: any) {
    const frontendUrl = 'https://my-wallets.firmanasgani.id';
    return {
      url: `${frontendUrl}/payment/unfinish?order_id=${query.order_id}&status_code=${query.status_code}&transaction_status=${query.transaction_status}`,
    };
  }

  @Public()
  @Get('error')
  @Redirect()
  async handleError(@Query() query: any) {
    const frontendUrl = 'https://my-wallets.firmanasgani.id';
    return {
      url: `${frontendUrl}/payment/error?order_id=${query.order_id}&status_code=${query.status_code}&transaction_status=${query.transaction_status}`,
    };
  }
}
