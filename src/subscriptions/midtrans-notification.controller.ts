import { Controller, Post, Body, Get, Query, Redirect } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsService } from './subscriptions.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('notification')
export class MidtransNotificationController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post()
  async handleNotification(@Body() body: any) {
    return this.subscriptionsService.handleMidtransWebhook(body);
  }

  @Public()
  @Get('finish')
  @Redirect()
  async handleFinish(@Query() query: any) {
    const frontendUrl =
      this.configService.get('FRONTEND_URL') ||
      'https://my-wallets.firmanasgani.id';
    return {
      url: `${frontendUrl}/payment/finish?order_id=${query.order_id}&status_code=${query.status_code}&transaction_status=${query.transaction_status}`,
    };
  }

  @Public()
  @Get('unfinish')
  @Redirect()
  async handleUnfinish(@Query() query: any) {
    const frontendUrl =
      this.configService.get('FRONTEND_URL') ||
      'https://my-wallets.firmanasgani.id';
    return {
      url: `${frontendUrl}/payment/unfinish?order_id=${query.order_id}&status_code=${query.status_code}&transaction_status=${query.transaction_status}`,
    };
  }

  @Public()
  @Get('error')
  @Redirect()
  async handleError(@Query() query: any) {
    const frontendUrl =
      this.configService.get('FRONTEND_URL') ||
      'https://my-wallets.firmanasgani.id';
    return {
      url: `${frontendUrl}/payment/error?order_id=${query.order_id}&status_code=${query.status_code}&transaction_status=${query.transaction_status}`,
    };
  }
}
