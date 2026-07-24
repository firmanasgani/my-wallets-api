import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailBlastsService } from './email-blasts.service';

@Injectable()
export class EmailBlastCron {
  private readonly logger = new Logger(EmailBlastCron.name);

  constructor(private emailBlastsService: EmailBlastsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledBlasts() {
    try {
      await this.emailBlastsService.processDueScheduledBlasts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Failed while processing scheduled email blasts: ${message}`,
      );
    }
  }
}
