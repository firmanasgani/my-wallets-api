import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { SecretEncryptionService } from 'src/common/crypto/secret-encryption.service';

const CONFIG_ID = 'payfest';

interface ResolvedConfig {
  baseUrl: string;
  accessKeyId: string;
  apiSecret: string;
}

export interface PayfestPaymentMethod {
  code: string;
  name: string;
  sort_order: number;
}

export interface PayfestCheckout {
  va_number?: string;
  bank?: string;
  qr_string?: string;
  deeplink_url?: string;
  payment_code?: string;
  expiry_time?: string;
}

export interface PayfestPayment {
  id: string;
  order_id: string;
  status: string;
  amount_minor: number;
  currency: string;
  checkout?: PayfestCheckout;
}

export interface CreatePayfestPaymentInput {
  customerRef: string;
  amountMinor: number;
  currency: string;
  description: string;
  paymentMethodCode: string;
  metadata?: Record<string, unknown>;
}

/**
 * Calls Payfest's consumer API (dashboard-financial-api — see that repo's
 * docs/getting-started.md) using the credentials an admin entered in
 * Settings > Integrations (src/admin/integrations). Every call re-reads
 * and re-decrypts the config instead of caching it at boot, so toggling
 * the integration on/off or rotating a secret in the admin panel takes
 * effect on the very next request.
 */
@Injectable()
export class PayfestClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretEncryptionService,
  ) {}

  private async resolveConfig(): Promise<ResolvedConfig> {
    const config = await this.prisma.payfestConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    if (
      !config ||
      !config.isEnabled ||
      !config.accessKeyId ||
      !config.apiSecretEncrypted
    ) {
      throw new ServiceUnavailableException(
        'Payfest integration is not configured or not enabled — see Settings > Integrations',
      );
    }
    return {
      baseUrl: config.baseUrl,
      accessKeyId: config.accessKeyId,
      apiSecret: this.secrets.decrypt(config.apiSecretEncrypted),
    };
  }

  /** Decrypted webhook secret, for signature verification — null when unset. */
  async getWebhookSecret(): Promise<string | null> {
    const config = await this.prisma.payfestConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    if (!config?.webhookSecretEncrypted) return null;
    return this.secrets.decrypt(config.webhookSecretEncrypted);
  }

  async isEnabled(): Promise<boolean> {
    const config = await this.prisma.payfestConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    return !!config?.isEnabled;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const config = await this.resolveConfig();
    const response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Access-Key': config.accessKeyId,
        'X-Api-Secret': config.apiSecret,
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const data: unknown = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      const errorBody = data as { error?: { message?: string } } | undefined;
      const message =
        errorBody?.error?.message ||
        `Payfest request failed (${response.status})`;
      if (response.status >= 400 && response.status < 500) {
        throw new BadRequestException(message);
      }
      throw new InternalServerErrorException(message);
    }

    return data as T;
  }

  async listPaymentMethods(): Promise<PayfestPaymentMethod[]> {
    const res = await this.request<{ data: PayfestPaymentMethod[] }>(
      'GET',
      '/v1/payment-methods',
    );
    return res.data;
  }

  async upsertCustomer(
    externalCustomerId: string,
    email?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.request('POST', '/v1/customers', {
      external_customer_id: externalCustomerId,
      ...(email ? { email } : {}),
      ...(metadata ? { metadata } : {}),
    });
  }

  async createPayment(
    input: CreatePayfestPaymentInput,
  ): Promise<PayfestPayment> {
    return this.request<PayfestPayment>(
      'POST',
      '/v1/payments',
      {
        customer_ref: input.customerRef,
        amount_minor: input.amountMinor,
        currency: input.currency,
        description: input.description,
        payment_method_code: input.paymentMethodCode,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
      { 'Idempotency-Key': randomUUID() },
    );
  }

  async getPayment(id: string): Promise<PayfestPayment> {
    return this.request<PayfestPayment>('GET', `/v1/payments/${id}`);
  }

  /**
   * Verifies X-Webhook-Signature (docs/api-contract-consumer.md §4.2 in
   * dashboard-financial-api): hex(HMAC_SHA256(webhookSecret, timestamp +
   * "." + rawBody)), compared constant-time, and rejects a timestamp more
   * than 5 minutes old (replay protection, per that same section). rawBody
   * must be the exact bytes received — re-serializing the parsed JSON
   * will not match.
   */
  async verifyWebhookSignature(
    rawBody: string,
    timestamp: string,
    signatureHeader: string,
  ): Promise<boolean> {
    const secret = await this.getWebhookSecret();
    if (!secret || !timestamp || !signatureHeader) return false;

    const timestampSeconds = Number(timestamp);
    if (
      !Number.isFinite(timestampSeconds) ||
      Math.abs(Date.now() / 1000 - timestampSeconds) > 5 * 60
    ) {
      return false;
    }

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    const provided = signatureHeader.startsWith('v1=')
      ? signatureHeader.slice(3)
      : signatureHeader;

    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(provided, 'hex');
    if (expectedBuf.length !== providedBuf.length) return false;
    return timingSafeEqual(expectedBuf, providedBuf);
  }
}
