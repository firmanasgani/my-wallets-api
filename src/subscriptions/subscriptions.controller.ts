import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  async getPlans() {
    return this.subscriptionsService.getPlans();
  }

  @Get('plans/:code')
  async getPlan(@Param('code') code: string) {
    return this.subscriptionsService.getPlanByCode(code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  async checkout(@Body() body: { planCode: string }, @Request() req) {
    return this.subscriptionsService.createCheckoutToken(
      req.user.id,
      body.planCode,
    );
  }

  @Post('midtrans-webhook')
  async midtransWebhook(@Body() body: any) {
    return this.subscriptionsService.handleMidtransWebhook(body);
  }
}
