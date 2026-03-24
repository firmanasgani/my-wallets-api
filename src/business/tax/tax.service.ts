import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Company, LogActionType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LogsService } from '../../logs/logs.service';
import { CreateTaxConfigDto } from './dto/create-tax-config.dto';
import { UpdateTaxConfigDto } from './dto/update-tax-config.dto';
import { CreateSuggestionRuleDto } from './dto/create-suggestion-rule.dto';
import { UpdateSuggestionRuleDto } from './dto/update-suggestion-rule.dto';

@Injectable()
export class TaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logsService: LogsService,
  ) {}

  // ─── TaxConfig CRUD ───────────────────────────────────────────────────────

  async listConfigs(company: Company) {
    return this.prisma.taxConfig.findMany({
      where: { companyId: company.id },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async createConfig(userId: string, company: Company, dto: CreateTaxConfigDto) {
    const config = await this.prisma.taxConfig.create({
      data: {
        companyId: company.id,
        type: dto.type,
        name: dto.name,
        rate: new Prisma.Decimal(dto.rate),
        isActive: dto.isActive ?? true,
        description: dto.description ?? null,
      },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_TAX_CONFIG_CREATE,
      entityType: 'TaxConfig',
      entityId: config.id,
      description: `Tax config "${config.name}" (${config.type}, ${config.rate}%) created.`,
    });

    return config;
  }

  async updateConfig(
    userId: string,
    company: Company,
    id: string,
    dto: UpdateTaxConfigDto,
  ) {
    await this.findConfigOrThrow(company.id, id);

    const updated = await this.prisma.taxConfig.update({
      where: { id },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.rate !== undefined && { rate: new Prisma.Decimal(dto.rate) }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_TAX_CONFIG_UPDATE,
      entityType: 'TaxConfig',
      entityId: id,
      description: `Tax config "${updated.name}" updated.`,
    });

    return updated;
  }

  async deleteConfig(userId: string, company: Company, id: string) {
    await this.findConfigOrThrow(company.id, id);

    await this.prisma.taxConfig.delete({ where: { id } });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_TAX_CONFIG_DELETE,
      entityType: 'TaxConfig',
      entityId: id,
      description: `Tax config deleted.`,
    });

    return { message: 'Tax config deleted.' };
  }

  // ─── TaxSuggestionRule CRUD ───────────────────────────────────────────────

  async listRules(company: Company) {
    return this.prisma.taxSuggestionRule.findMany({
      where: { companyId: company.id },
      include: { taxConfig: { select: { id: true, name: true, type: true, rate: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createRule(userId: string, company: Company, dto: CreateSuggestionRuleDto) {
    // Verify taxConfigId belongs to this company
    await this.findConfigOrThrow(company.id, dto.taxConfigId);

    const rule = await this.prisma.taxSuggestionRule.create({
      data: {
        companyId: company.id,
        taxConfigId: dto.taxConfigId,
        triggerCoaIds: dto.triggerCoaIds ?? [],
        triggerContactType: dto.triggerContactType ?? null,
        triggerKeywords: dto.triggerKeywords ?? [],
        minAmount: dto.minAmount != null ? new Prisma.Decimal(dto.minAmount) : null,
        priority: dto.priority ?? 0,
        note: dto.note ?? null,
        isActive: dto.isActive ?? true,
      },
      include: { taxConfig: { select: { id: true, name: true, type: true, rate: true } } },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_SUGGESTION_RULE_CREATE,
      entityType: 'TaxSuggestionRule',
      entityId: rule.id,
      description: `Tax suggestion rule created for "${rule.taxConfig.name}".`,
    });

    return rule;
  }

  async updateRule(
    userId: string,
    company: Company,
    id: string,
    dto: UpdateSuggestionRuleDto,
  ) {
    await this.findRuleOrThrow(company.id, id);
    if (dto.taxConfigId) await this.findConfigOrThrow(company.id, dto.taxConfigId);

    const updated = await this.prisma.taxSuggestionRule.update({
      where: { id },
      data: {
        ...(dto.taxConfigId !== undefined && { taxConfigId: dto.taxConfigId }),
        ...(dto.triggerCoaIds !== undefined && { triggerCoaIds: dto.triggerCoaIds }),
        ...(dto.triggerContactType !== undefined && { triggerContactType: dto.triggerContactType }),
        ...(dto.triggerKeywords !== undefined && { triggerKeywords: dto.triggerKeywords }),
        ...(dto.minAmount !== undefined && { minAmount: dto.minAmount != null ? new Prisma.Decimal(dto.minAmount) : null }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.note !== undefined && { note: dto.note }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_SUGGESTION_RULE_UPDATE,
      entityType: 'TaxSuggestionRule',
      entityId: id,
      description: `Tax suggestion rule updated.`,
    });

    return updated;
  }

  async deleteRule(userId: string, company: Company, id: string) {
    await this.findRuleOrThrow(company.id, id);
    await this.prisma.taxSuggestionRule.delete({ where: { id } });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_SUGGESTION_RULE_DELETE,
      entityType: 'TaxSuggestionRule',
      entityId: id,
      description: `Tax suggestion rule deleted.`,
    });

    return { message: 'Suggestion rule deleted.' };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  async findConfigOrThrow(companyId: string, id: string) {
    const config = await this.prisma.taxConfig.findFirst({
      where: { id, companyId },
    });
    if (!config) throw new NotFoundException('Tax config not found.');
    return config;
  }

  private async findRuleOrThrow(companyId: string, id: string) {
    const rule = await this.prisma.taxSuggestionRule.findFirst({
      where: { id, companyId },
    });
    if (!rule) throw new NotFoundException('Suggestion rule not found.');
    return rule;
  }
}
