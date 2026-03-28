import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Asset,
  AssetStatus,
  Company,
  DepreciationMethod,
  JournalEntryStatus,
  LogActionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LogsService } from '../../logs/logs.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { DisposeAssetDto } from './dto/dispose-asset.dto';
import { RunDepreciationDto } from './dto/run-depreciation.dto';
import { RecordUnitsDto } from './dto/record-units.dto';
import { DepreciationEngine } from './depreciation.engine';

// ── Asset with accumulated totals (for service responses) ────────────────────
type AssetSummary = Asset & {
  totalDepreciated: string;
  currentBookValue: string;
  depreciationCount: number;
};

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logsService: LogsService,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async findAll(company: Company, status?: AssetStatus) {
    const assets = await this.prisma.asset.findMany({
      where: {
        companyId: company.id,
        ...(status ? { status } : {}),
      },
      include: {
        assetCoa: { select: { id: true, code: true, name: true } },
        accumulatedCoa: { select: { id: true, code: true, name: true } },
        depreciationExpenseCoa: { select: { id: true, code: true, name: true } },
        _count: { select: { depreciations: true } },
      },
      orderBy: [{ assetType: 'asc' }, { code: 'asc' }],
    });

    // Fetch accumulated totals per asset in one query (O(1) DB round-trip)
    const totals = await this.prisma.assetDepreciation.groupBy({
      by: ['assetId'],
      where: { companyId: company.id },
      _sum: { depreciationAmount: true },
    });
    const totalMap = new Map(totals.map((t) => [t.assetId, t._sum.depreciationAmount?.toNumber() ?? 0]));

    return assets.map((a) => {
      const totalDepreciated = totalMap.get(a.id) ?? 0;
      return {
        ...a,
        depreciationCount: a._count.depreciations,
        totalDepreciated: totalDepreciated.toFixed(2),
        currentBookValue: Math.max(a.acquisitionCost.toNumber() - totalDepreciated, a.residualValue.toNumber()).toFixed(2),
      };
    });
  }

  async findOne(company: Company, id: string): Promise<AssetSummary & object> {
    const asset = await this.prisma.asset.findFirst({
      where: { id, companyId: company.id },
      include: {
        assetCoa: { select: { id: true, code: true, name: true } },
        accumulatedCoa: { select: { id: true, code: true, name: true } },
        depreciationExpenseCoa: { select: { id: true, code: true, name: true } },
        disposalCoa: { select: { id: true, code: true, name: true } },
        depreciations: {
          orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
          take: 5,
          select: {
            id: true, periodYear: true, periodMonth: true,
            depreciationAmount: true, accumulatedDepreciation: true, bookValue: true,
          },
        },
        _count: { select: { depreciations: true } },
      },
    });

    if (!asset) throw new NotFoundException('Asset not found.');

    const totalDepreciated = DepreciationEngine.sumAccumulated(asset.depreciations as any);
    const allAccum = await this.prisma.assetDepreciation.aggregate({
      where: { assetId: id },
      _sum: { depreciationAmount: true },
    });
    const realTotal = allAccum._sum.depreciationAmount?.toNumber() ?? 0;

    return {
      ...asset,
      depreciationCount: asset._count.depreciations,
      totalDepreciated: realTotal.toFixed(2),
      currentBookValue: Math.max(asset.acquisitionCost.toNumber() - realTotal, asset.residualValue.toNumber()).toFixed(2),
    };
  }

  async create(userId: string, company: Company, dto: CreateAssetDto) {
    // Validate UoP requires unitsTotal
    if (dto.depreciationMethod === DepreciationMethod.UNITS_OF_PRODUCTION && !dto.unitsTotal) {
      throw new BadRequestException('unitsTotal is required for UNITS_OF_PRODUCTION method.');
    }

    // Validate COA IDs belong to this company
    await this.validateCoaOwnership(company.id, [
      dto.assetCoaId, dto.accumulatedCoaId, dto.depreciationExpenseCoaId,
    ]);

    // Code uniqueness within company
    const existing = await this.prisma.asset.findUnique({
      where: { companyId_code: { companyId: company.id, code: dto.code } },
    });
    if (existing) throw new BadRequestException(`Asset code "${dto.code}" already exists.`);

    const asset = await this.prisma.asset.create({
      data: {
        companyId: company.id,
        assetType: dto.assetType,
        name: dto.name,
        code: dto.code,
        acquisitionDate: new Date(dto.acquisitionDate),
        acquisitionCost: new Prisma.Decimal(dto.acquisitionCost),
        residualValue: new Prisma.Decimal(dto.residualValue ?? 0),
        usefulLifeMonths: dto.usefulLifeMonths,
        depreciationMethod: dto.depreciationMethod,
        unitsTotal: dto.unitsTotal != null ? new Prisma.Decimal(dto.unitsTotal) : null,
        assetCoaId: dto.assetCoaId,
        accumulatedCoaId: dto.accumulatedCoaId,
        depreciationExpenseCoaId: dto.depreciationExpenseCoaId,
        notes: dto.notes ?? null,
        createdByUserId: userId,
      },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_ASSET_CREATE,
      entityType: 'Asset',
      entityId: asset.id,
      description: `Asset "${asset.name}" (${asset.code}) created. Method: ${asset.depreciationMethod}, Useful life: ${asset.usefulLifeMonths} months.`,
    });

    return asset;
  }

  async update(userId: string, company: Company, id: string, dto: UpdateAssetDto) {
    const asset = await this.findAssetOrThrow(company.id, id);

    const updated = await this.prisma.asset.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_ASSET_UPDATE,
      entityType: 'Asset',
      entityId: id,
      description: `Asset "${asset.name}" updated.`,
    });

    return updated;
  }

  async remove(userId: string, company: Company, id: string) {
    const asset = await this.findAssetOrThrow(company.id, id);

    const hasDepreciation = await this.prisma.assetDepreciation.count({ where: { assetId: id } });
    if (hasDepreciation > 0) {
      throw new BadRequestException('Cannot delete asset that already has depreciation records.');
    }

    await this.prisma.asset.delete({ where: { id } });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_ASSET_UPDATE,
      entityType: 'Asset',
      entityId: id,
      description: `Asset "${asset.name}" deleted.`,
    });

    return { message: 'Asset deleted.' };
  }

  // ─── Depreciation Schedule Projection ────────────────────────────────────

  async getSchedule(company: Company, id: string) {
    const asset = await this.findAssetOrThrow(company.id, id);
    const allDepreciations = await this.prisma.assetDepreciation.findMany({
      where: { assetId: id },
      orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
    });

    const accumulated = DepreciationEngine.sumAccumulated(allDepreciations);
    const currentBookValue = Math.max(
      asset.acquisitionCost.toNumber() - accumulated,
      asset.residualValue.toNumber(),
    );

    // Find the first unrun period to start projecting from
    const lastRun = allDepreciations.at(-1);
    let startYear: number;
    let startMonth: number;
    if (lastRun) {
      const nextDate = new Date(lastRun.periodYear, lastRun.periodMonth, 1);
      startYear = nextDate.getFullYear();
      startMonth = nextDate.getMonth() + 1;
    } else {
      const acqDate = new Date(asset.acquisitionDate);
      startYear = acqDate.getFullYear();
      startMonth = acqDate.getMonth() + 1;
    }

    const projected = DepreciationEngine.generateSchedule({
      method: asset.depreciationMethod,
      acquisitionCost: asset.acquisitionCost.toNumber(),
      residualValue: asset.residualValue.toNumber(),
      usefulLifeMonths: asset.usefulLifeMonths,
      startYear,
      startMonth,
    });

    return {
      asset: {
        id: asset.id,
        code: asset.code,
        name: asset.name,
        depreciationMethod: asset.depreciationMethod,
        acquisitionCost: asset.acquisitionCost.toFixed(2),
        residualValue: asset.residualValue.toFixed(2),
        usefulLifeMonths: asset.usefulLifeMonths,
        currentBookValue: currentBookValue.toFixed(2),
        totalDepreciated: accumulated.toFixed(2),
        periodsAlreadyRun: allDepreciations.length,
      },
      projectedSchedule: projected,
    };
  }

  async getDepreciationHistory(company: Company, id: string) {
    await this.findAssetOrThrow(company.id, id);

    return this.prisma.assetDepreciation.findMany({
      where: { assetId: id },
      include: {
        journalEntry: {
          select: { id: true, description: true, transactionDate: true },
        },
      },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });
  }

  // ─── Run Depreciation (Manual Trigger) ───────────────────────────────────

  async runDepreciation(userId: string, company: Company, dto: RunDepreciationDto) {
    const { year, month, assetIds } = dto;

    const where: Prisma.AssetWhereInput = {
      companyId: company.id,
      status: AssetStatus.ACTIVE,
      depreciationMethod: { not: DepreciationMethod.UNITS_OF_PRODUCTION },
      ...(assetIds?.length ? { id: { in: assetIds } } : {}),
    };

    const assets = await this.prisma.asset.findMany({
      where,
      include: {
        depreciations: {
          orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
        },
      },
    });

    const results = await Promise.all(
      assets.map((asset) => this.runSingleDepreciation(userId, company.id, asset, year, month, undefined)),
    );

    const processed = results.filter((r) => r !== null);

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_ASSET_DEPRECIATION_RUN,
      entityType: 'Company',
      entityId: company.id,
      description: `Manual depreciation run for ${processed.length}/${assets.length} assets — period ${year}-${month}.`,
      details: { year, month, processed: processed.length, total: assets.length },
    });

    return {
      period: { year, month },
      total: assets.length,
      processed: processed.length,
      skipped: assets.length - processed.length,
      results: processed,
    };
  }

  async recordUnitsAndRun(userId: string, company: Company, assetId: string, dto: RecordUnitsDto) {
    const asset = await this.findAssetOrThrow(company.id, assetId);

    if (asset.depreciationMethod !== DepreciationMethod.UNITS_OF_PRODUCTION) {
      throw new BadRequestException('This endpoint is only for UNITS_OF_PRODUCTION assets.');
    }
    if (asset.status !== AssetStatus.ACTIVE) {
      throw new BadRequestException('Asset is not active.');
    }

    const fullAsset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { depreciations: true },
    });

    const result = await this.runSingleDepreciation(
      userId, company.id, fullAsset!, dto.year, dto.month, dto.unitsProduced,
    );

    if (!result) {
      return { message: 'No depreciation applicable for this period (already run or fully depreciated).' };
    }

    return result;
  }

  // ─── Disposal ─────────────────────────────────────────────────────────────

  async dispose(userId: string, company: Company, assetId: string, dto: DisposeAssetDto) {
    const asset = await this.findAssetOrThrow(company.id, assetId);
    if (asset.status !== AssetStatus.ACTIVE && asset.status !== AssetStatus.FULLY_DEPRECIATED) {
      throw new BadRequestException('Asset is already disposed.');
    }

    // Validate disposal COA belongs to this company
    const coasToValidate = [dto.disposalCoaId];
    if (dto.gainCoaId) coasToValidate.push(dto.gainCoaId);
    if (dto.lossCoaId) coasToValidate.push(dto.lossCoaId);
    await this.validateCoaOwnership(company.id, coasToValidate);

    const totalDepreciation = await this.prisma.assetDepreciation.aggregate({
      where: { assetId },
      _sum: { depreciationAmount: true },
    });
    const accumulated = totalDepreciation._sum.depreciationAmount?.toNumber() ?? 0;
    const bookValue = Math.max(asset.acquisitionCost.toNumber() - accumulated, asset.residualValue.toNumber());
    const gain = dto.disposalAmount - bookValue;

    // Resolve gain/loss COA — fallback to system defaults by code
    const gainLossCoas = await this.prisma.chartOfAccount.findMany({
      where: { companyId: company.id, code: { in: ['6-002', '7-002'] } },
      select: { id: true, code: true },
    });
    const defaultGainCoaId = gainLossCoas.find((c) => c.code === '6-002')?.id;
    const defaultLossCoaId = gainLossCoas.find((c) => c.code === '7-002')?.id;

    const resolvedGainCoaId = dto.gainCoaId ?? defaultGainCoaId;
    const resolvedLossCoaId = dto.lossCoaId ?? defaultLossCoaId;

    const result = await this.prisma.$transaction(async (tx) => {
      // ── Build journal lines ──────────────────────────────────────────────
      // Standard disposal lines (PSAK 16):
      //   DR  DisposalCoa (Kas/Bank)          = disposalAmount
      //   DR  AccumulatedCoa                  = accumulated
      //   CR  AssetCoa                        = acquisitionCost
      //   DR/CR  Gain/Loss COA                = |gain|

      const lines = [
        { coaId: dto.disposalCoaId, type: 'DEBIT' as const, amount: new Prisma.Decimal(dto.disposalAmount), description: 'Penerimaan pelepasan aset' },
        { coaId: asset.accumulatedCoaId, type: 'DEBIT' as const, amount: new Prisma.Decimal(accumulated), description: 'Hapus akumulasi penyusutan' },
        { coaId: asset.assetCoaId, type: 'CREDIT' as const, amount: new Prisma.Decimal(asset.acquisitionCost), description: 'Hapus nilai perolehan aset' },
      ];

      if (gain > 0 && resolvedGainCoaId) {
        lines.push({ coaId: resolvedGainCoaId, type: 'CREDIT' as const, amount: new Prisma.Decimal(gain), description: 'Laba pelepasan aset' });
      } else if (gain < 0 && resolvedLossCoaId) {
        lines.push({ coaId: resolvedLossCoaId, type: 'DEBIT' as const, amount: new Prisma.Decimal(Math.abs(gain)), description: 'Rugi pelepasan aset' });
      }

      const entry = await tx.journalEntry.create({
        data: {
          companyId: company.id,
          description: `Pelepasan aset: ${asset.name} (${asset.code})`,
          transactionDate: new Date(dto.disposalDate),
          isSystemGenerated: true,
          status: JournalEntryStatus.APPROVED,
          createdByUserId: userId,
          lines: { create: lines },
        },
      });

      const updatedAsset = await tx.asset.update({
        where: { id: assetId },
        data: {
          status: AssetStatus.DISPOSED,
          disposalDate: new Date(dto.disposalDate),
          disposalAmount: new Prisma.Decimal(dto.disposalAmount),
          disposalCoaId: dto.disposalCoaId,
        },
      });

      return { asset: updatedAsset, journalEntry: entry, bookValue: bookValue.toFixed(2), gain: gain.toFixed(2) };
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_ASSET_DISPOSED,
      entityType: 'Asset',
      entityId: assetId,
      description: `Asset "${asset.name}" disposed. Proceeds: ${dto.disposalAmount}, Book value: ${bookValue.toFixed(2)}, Gain/Loss: ${gain.toFixed(2)}.`,
    });

    return result;
  }

  // ─── Internal: single-asset depreciation run ─────────────────────────────

  /**
   * Runs depreciation for ONE asset for a given period.
   * Returns null if already run or nothing to depreciate.
   */
  async runSingleDepreciation(
    userId: string,
    companyId: string,
    asset: Asset & { depreciations: any[] },
    year: number,
    month: number,
    unitsProduced: number | undefined,
  ) {
    // Skip if already run for this period
    const alreadyRun = asset.depreciations.some(
      (d) => d.periodYear === year && d.periodMonth === month,
    );
    if (alreadyRun) return null;

    const accumulated = DepreciationEngine.sumAccumulated(asset.depreciations);
    const currentBookValue = Math.max(
      asset.acquisitionCost.toNumber() - accumulated,
      asset.residualValue.toNumber(),
    );

    const deprAmount = DepreciationEngine.calculateMonthly({
      method: asset.depreciationMethod,
      acquisitionCost: asset.acquisitionCost.toNumber(),
      residualValue: asset.residualValue.toNumber(),
      usefulLifeMonths: asset.usefulLifeMonths,
      currentBookValue,
      accumulatedDepreciation: accumulated,
      unitsProduced,
      unitsTotal: asset.unitsTotal?.toNumber(),
    });

    if (deprAmount <= 0) return null;

    const newAccumulated = Math.round((accumulated + deprAmount) * 100) / 100;
    const newBookValue = Math.max(
      Math.round((asset.acquisitionCost.toNumber() - newAccumulated) * 100) / 100,
      asset.residualValue.toNumber(),
    );
    const isFullyDepreciated = newBookValue <= asset.residualValue.toNumber();

    const result = await this.prisma.$transaction(async (tx) => {
      const methodLabel = asset.assetType === 'TANGIBLE' ? 'Penyusutan' : 'Amortisasi';
      const periodLabel = `${String(month).padStart(2, '0')}/${year}`;

      const entry = await tx.journalEntry.create({
        data: {
          companyId,
          description: `${methodLabel} aset: ${asset.name} (${asset.code}) — Periode ${periodLabel}`,
          transactionDate: new Date(year, month - 1, 1),
          isSystemGenerated: true,
          status: JournalEntryStatus.APPROVED,
          createdByUserId: userId,
          lines: {
            create: [
              { coaId: asset.depreciationExpenseCoaId, type: 'DEBIT', amount: new Prisma.Decimal(deprAmount) },
              { coaId: asset.accumulatedCoaId, type: 'CREDIT', amount: new Prisma.Decimal(deprAmount) },
            ],
          },
        },
      });

      const deprRecord = await tx.assetDepreciation.create({
        data: {
          assetId: asset.id,
          companyId,
          periodYear: year,
          periodMonth: month,
          depreciationAmount: new Prisma.Decimal(deprAmount),
          accumulatedDepreciation: new Prisma.Decimal(newAccumulated),
          bookValue: new Prisma.Decimal(newBookValue),
          unitsProduced: unitsProduced != null ? new Prisma.Decimal(unitsProduced) : null,
          journalEntryId: entry.id,
        },
      });

      if (isFullyDepreciated) {
        await tx.asset.update({ where: { id: asset.id }, data: { status: AssetStatus.FULLY_DEPRECIATED } });
      }

      return {
        assetId: asset.id,
        assetCode: asset.code,
        assetName: asset.name,
        period: { year, month },
        depreciationAmount: deprAmount.toFixed(2),
        accumulatedDepreciation: newAccumulated.toFixed(2),
        bookValue: newBookValue.toFixed(2),
        isFullyDepreciated,
        journalEntryId: entry.id,
      };
    });

    return result;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async findAssetOrThrow(companyId: string, id: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id, companyId } });
    if (!asset) throw new NotFoundException('Asset not found.');
    return asset;
  }

  private async validateCoaOwnership(companyId: string, coaIds: string[]) {
    const unique = [...new Set(coaIds)];
    const found = await this.prisma.chartOfAccount.findMany({
      where: { id: { in: unique }, companyId },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new NotFoundException('One or more COA accounts not found in this company.');
    }
  }
}
