import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @UseGuards(JwtAuthGuard)
  @Get('payment-history')
  async getPaymentHistory(@Request() req) {
    return this.subscriptionsService.getPaymentHistory(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('resume-payment')
  async resumePayment(@Body() body: { orderId: string }, @Request() req) {
    return this.subscriptionsService.resumePayment(req.user.id, body.orderId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('downgrade')
  async downgrade(@Body() body: { planCode: string }, @Request() req) {
    return this.subscriptionsService.scheduleDowngrade(
      req.user.id,
      body.planCode,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('downgrade/cancel')
  async cancelDowngrade(@Request() req) {
    return this.subscriptionsService.cancelScheduledDowngrade(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('manual-payment')
  @UseInterceptors(FileInterceptor('file'))
  async submitManualPayment(
    @Body() body: { planCode: string },
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('Proof of transfer file is required');
    }
    return this.subscriptionsService.submitManualPayment(
      req.user.id,
      body.planCode,
      file,
    );
  }

  @Post('midtrans-webhook')
  async midtransWebhook(@Body() body: any) {
    return this.subscriptionsService.handleMidtransWebhook(body);
  }
}
