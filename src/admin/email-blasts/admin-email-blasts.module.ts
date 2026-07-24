import { Module } from '@nestjs/common';
import { AdminEmailBlastsController } from './admin-email-blasts.controller';
import { EmailBlastsService } from './email-blasts.service';
import { EmailBlastCron } from './email-blast.cron';
import { MailModule } from 'src/mail/mail.module';
import { AdminAuthModule } from '../auth/admin-auth.module';

@Module({
  imports: [MailModule, AdminAuthModule],
  controllers: [AdminEmailBlastsController],
  providers: [EmailBlastsService, EmailBlastCron],
})
export class AdminEmailBlastsModule {}
