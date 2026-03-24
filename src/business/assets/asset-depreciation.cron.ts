import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AssetStatus, DepreciationMethod, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetsService } from './assets.service';

/**
 * Runs on the 1st of every month at 01:00.
 * Automatically depreciates all ACTIVE non-UoP assets for companies with
 * an active BUSINESS subscription.
 */
@Injectable()
export class AssetDepreciationCron {
  private readonly logger = new Logger(AssetDepreciationCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assetsService: AssetsService,
  ) {}

  @Cron('0 1 1 * *', { name: 'asset-depreciation', timeZone: 'Asia/Jakarta' })
  async handleMonthlyDepreciation() {
    const now = new Date();
    // Run for the CURRENT month (month job fires on 1st of that month)
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-based

    this.logger.log(`Asset depreciation cron started for ${year}-${String(month).padStart(2, '0')}`);

    // Find all companies with active BUSINESS subscriptions
    const businessPlans = await this.prisma.userSubscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        plan: { code: { in: ['BUSINESS_1M', 'BUSINESS_6M', 'BUSINESS_12M'] } },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      select: { userId: true },
    });

    if (businessPlans.length === 0) {
      this.logger.log('No active business subscribers. Cron done.');
      return;
    }

    const ownerUserIds = businessPlans.map((s) => s.userId);

    // Load all active non-UoP assets for those companies in one query
    const assets = await this.prisma.asset.findMany({
      where: {
        company: { owner: { id: { in: ownerUserIds } } },
        status: AssetStatus.ACTIVE,
        depreciationMethod: { not: DepreciationMethod.UNITS_OF_PRODUCTION },
      },
      include: {
        depreciations: {
          orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
        },
        company: { select: { id: true, ownerId: true } },
      },
    });

    this.logger.log(`Found ${assets.length} assets to process.`);

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const asset of assets) {
      try {
        const result = await this.assetsService.runSingleDepreciation(
          asset.company.ownerId, // system action — use owner as actor
          asset.companyId,
          asset,
          year,
          month,
          undefined,
        );
        if (result) {
          processed++;
        } else {
          skipped++;
        }
      } catch (err) {
        errors++;
        this.logger.error(`Failed depreciation for asset ${asset.id}: ${(err as Error).message}`);
      }
    }

    this.logger.log(
      `Asset depreciation cron completed. Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors}.`,
    );
  }
}
