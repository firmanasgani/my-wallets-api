import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SubscriptionsService } from './subscriptions.service';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Payfest (Dashboard Financial API) webhook URL. Register this app's
 * endpoint in the Payfest CMS — Webhooks → Add endpoint — pointed at:
 *   https://your-domain.com/payfest-notification
 * docs/api-contract-consumer.md §4 in that repo documents the envelope
 * and signature this verifies.
 */
@Public()
@Controller('payfest-notification')
export class PayfestNotificationController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  async handleNotification(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-timestamp') timestamp: string,
    @Headers('x-webhook-signature') signature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('missing request body');
    }
    return this.subscriptionsService.handlePayfestWebhook(
      req.rawBody.toString('utf8'),
      timestamp,
      signature,
    );
  }
}
