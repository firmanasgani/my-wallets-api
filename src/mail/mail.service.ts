import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

export interface BlastEmail {
  to: string;
  subject: string;
  html: string;
}

export interface BlastEmailResult {
  to: string;
  success: boolean;
  error?: string;
}

// Resend's batch endpoint accepts at most 100 emails per request.
const BATCH_SIZE = 100;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend = new Resend(process.env.RESEND_API_KEY);
  private readonly fromAddress = (
    process.env.SMTP_FROM || 'Moneytory <noreply@moneytory.com>'
  ).replace(/^["']|["']$/g, '');

  /** Sends a batch of emails via Resend, chunked to respect the provider's per-request limit. */
  async sendBatch(emails: BlastEmail[]): Promise<BlastEmailResult[]> {
    const results: BlastEmailResult[] = [];

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const chunk = emails.slice(i, i + BATCH_SIZE);

      try {
        const { error } = await this.resend.batch.send(
          chunk.map((email) => ({
            from: this.fromAddress,
            to: email.to,
            subject: email.subject,
            html: email.html,
          })),
        );

        if (error) {
          this.logger.error(`Batch send failed: ${JSON.stringify(error)}`);
          for (const email of chunk) {
            results.push({
              to: email.to,
              success: false,
              error: error.message,
            });
          }
        } else {
          for (const email of chunk) {
            results.push({ to: email.to, success: true });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`Exception during batch send: ${message}`);
        for (const email of chunk) {
          results.push({ to: email.to, success: false, error: message });
        }
      }
    }

    return results;
  }
}
