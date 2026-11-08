import { Injectable } from '@nestjs/common';
import { LogActionType, PayfestConfig } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { LogsService } from 'src/logs/logs.service';
import { SecretEncryptionService } from 'src/common/crypto/secret-encryption.service';
import { UpdatePayfestConfigDto } from './dto/update-payfest-config.dto';

const CONFIG_ID = 'payfest';
const DEFAULT_BASE_URL = 'https://api-financial.firmanasgani.id';

// What the admin UI is allowed to see — accessKeyId is not secret (it's
// shown in the Payfest CMS too), but the actual secrets are only ever
// reflected as booleans. There is no "reveal" endpoint, matching how the
// Payfest CMS itself only shows a secret once at issuance.
export interface PayfestConfigView {
  baseUrl: string;
  accessKeyId: string | null;
  hasApiSecret: boolean;
  hasWebhookSecret: boolean;
  isEnabled: boolean;
  updatedAt: Date | null;
  updatedByAdminId: string | null;
}

@Injectable()
export class AdminIntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logsService: LogsService,
    private readonly secrets: SecretEncryptionService,
  ) {}

  async getPayfestConfig(): Promise<PayfestConfigView> {
    const config = await this.prisma.payfestConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    return this.toView(config);
  }

  async updatePayfestConfig(
    dto: UpdatePayfestConfigDto,
    adminId: string,
  ): Promise<PayfestConfigView> {
    const data: {
      baseUrl?: string;
      accessKeyId?: string;
      apiSecretEncrypted?: string;
      webhookSecretEncrypted?: string;
      isEnabled?: boolean;
      updatedByAdminId: string;
    } = { updatedByAdminId: adminId };
    const changedFields: string[] = [];

    if (dto.baseUrl !== undefined) {
      data.baseUrl = dto.baseUrl;
      changedFields.push('baseUrl');
    }
    if (dto.accessKeyId !== undefined) {
      data.accessKeyId = dto.accessKeyId;
      changedFields.push('accessKeyId');
    }
    // Secrets are only ever overwritten, never cleared by an empty value —
    // a blank field in the admin form must mean "leave it alone," since
    // the plaintext can't be shown back for the admin to re-confirm.
    if (dto.apiSecret) {
      data.apiSecretEncrypted = this.secrets.encrypt(dto.apiSecret);
      changedFields.push('apiSecret');
    }
    if (dto.webhookSecret) {
      data.webhookSecretEncrypted = this.secrets.encrypt(dto.webhookSecret);
      changedFields.push('webhookSecret');
    }
    if (dto.isEnabled !== undefined) {
      data.isEnabled = dto.isEnabled;
      changedFields.push('isEnabled');
    }

    const updated = await this.prisma.payfestConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, baseUrl: DEFAULT_BASE_URL, ...data },
      update: data,
    });

    await this.logsService.create({
      adminId,
      actionType: LogActionType.PAYFEST_CONFIG_UPDATE,
      entityType: 'PayfestConfig',
      entityId: updated.id,
      description: `Payfest integration config updated (${changedFields.join(', ') || 'no changes'})`,
      details: { changedFields },
    });

    return this.toView(updated);
  }

  private toView(config: PayfestConfig | null): PayfestConfigView {
    if (!config) {
      return {
        baseUrl: DEFAULT_BASE_URL,
        accessKeyId: null,
        hasApiSecret: false,
        hasWebhookSecret: false,
        isEnabled: false,
        updatedAt: null,
        updatedByAdminId: null,
      };
    }
    return {
      baseUrl: config.baseUrl,
      accessKeyId: config.accessKeyId,
      hasApiSecret: !!config.apiSecretEncrypted,
      hasWebhookSecret: !!config.webhookSecretEncrypted,
      isEnabled: config.isEnabled,
      updatedAt: config.updatedAt,
      updatedByAdminId: config.updatedByAdminId,
    };
  }
}
