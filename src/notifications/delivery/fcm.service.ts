import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';

export interface FcmSendResult {
  token: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Thin wrapper around firebase-admin. Users only — admins never get mobile
 * push (see NOTIFICATION_SYSTEM_PLAN.md §2), so this is only ever called
 * from the FCM delivery drain in notifications.cron.ts.
 */
@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private app: App | null = null;
  private messaging: Messaging | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      this.app = existingApps[0];
      this.messaging = getMessaging(this.app);
      return;
    }

    const serviceAccountJson = this.configService.get<string>('FCM_SERVICE_ACCOUNT_JSON');
    const projectId = this.configService.get<string>('FCM_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FCM_CLIENT_EMAIL');
    const privateKey = this.configService.get<string>('FCM_PRIVATE_KEY');

    try {
      if (serviceAccountJson) {
        this.app = initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
      } else if (projectId && clientEmail && privateKey) {
        this.app = initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        });
      } else {
        this.logger.warn(
          'FCM credentials not configured (FCM_SERVICE_ACCOUNT_JSON or FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY) — mobile push is disabled.',
        );
        return;
      }
      this.messaging = getMessaging(this.app);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to initialize Firebase Admin: ${message}`);
    }
  }

  get isEnabled(): boolean {
    return this.messaging !== null;
  }

  /**
   * Sends up to 500 distinct messages (each its own token + payload) in one
   * batched call. The delivery queue mixes unrelated notifications for
   * different users, so this — not sendEachForMulticast, which broadcasts a
   * single shared payload to many tokens — is the right primitive: it still
   * batches into one HTTP call, but each recipient gets their own content.
   */
  async sendBatch(
    messages: { token: string; title: string; body: string; data?: Record<string, string> }[],
  ): Promise<FcmSendResult[]> {
    if (!this.messaging) {
      return messages.map((message) => ({
        token: message.token,
        success: false,
        errorMessage: 'FCM not configured',
      }));
    }
    if (messages.length === 0) return [];

    const response = await this.messaging.sendEach(
      messages.map((message) => ({
        token: message.token,
        notification: { title: message.title, body: message.body },
        data: message.data,
      })),
    );

    return response.responses.map((result, index) => ({
      token: messages[index].token,
      success: result.success,
      errorCode: result.error?.code,
      errorMessage: result.error?.message,
    }));
  }

  /** True when FCM reports the token as permanently invalid (uninstalled app, revoked token). */
  isTokenInvalidError(errorCode?: string): boolean {
    return !!errorCode && INVALID_TOKEN_ERROR_CODES.has(errorCode);
  }
}
