import { DepreciationMethod } from '@prisma/client';

export interface DepreciationPeriod {
  year: number;
  month: number; // 1-based
  depreciationAmount: number;
  accumulatedDepreciation: number;
  bookValue: number;
}

interface CalculateParams {
  method: DepreciationMethod;
  acquisitionCost: number;
  residualValue: number;
  usefulLifeMonths: number;
  currentBookValue: number;
  accumulatedDepreciation: number;
  unitsProduced?: number;
  unitsTotal?: number;
}

/**
 * Pure stateless calculation engine — no DB access, fully testable.
 *
 * References:
 *  - PSAK 16 (Aset Tetap) — tangible asset depreciation
 *  - PSAK 19 (Aset Tak Berwujud) — intangible asset amortisation
 */
export class DepreciationEngine {
  /**
   * Calculate the depreciation amount for ONE period.
   * Returns 0 when the asset is already fully depreciated.
   */
  static calculateMonthly(params: CalculateParams): number {
    const {
      method,
      acquisitionCost,
      residualValue,
      usefulLifeMonths,
      currentBookValue,
      accumulatedDepreciation,
      unitsProduced,
      unitsTotal,
    } = params;

    const maxDepreciable = acquisitionCost - residualValue;
    const remaining = maxDepreciable - accumulatedDepreciation;

    if (remaining <= 0 || currentBookValue <= residualValue) return 0;

    let monthly: number;

    switch (method) {
      case DepreciationMethod.STRAIGHT_LINE: {
        // PSAK 16 par. 62a — equal allocation over useful life
        monthly = maxDepreciable / usefulLifeMonths;
        break;
      }

      case DepreciationMethod.DECLINING_BALANCE: {
        // PSAK 16 par. 62b — rate derived from: rate = 1 - (residual/cost)^(1/n)
        const years = usefulLifeMonths / 12;
        // Guard against residualValue=0 which would make annualRate = 1 (100%)
        const effectiveResidual = residualValue > 0 ? residualValue : acquisitionCost * 0.01;
        const annualRate = 1 - Math.pow(effectiveResidual / acquisitionCost, 1 / years);
        monthly = currentBookValue * (annualRate / 12);
        break;
      }

      case DepreciationMethod.DOUBLE_DECLINING: {
        // Double the straight-line rate applied to book value
        const years = usefulLifeMonths / 12;
        const annualRate = 2 / years;
        monthly = currentBookValue * (annualRate / 12);
        break;
      }

      case DepreciationMethod.UNITS_OF_PRODUCTION: {
        // PSAK 16 par. 62c — proportional to usage
        if (!unitsProduced || !unitsTotal || unitsTotal <= 0) return 0;
        const perUnit = maxDepreciable / unitsTotal;
        monthly = unitsProduced * perUnit;
        break;
      }

      default:
        return 0;
    }

    // Never depreciate below residual value; round to 2 dp
    const capped = Math.min(monthly, remaining);
    return Math.round(capped * 100) / 100;
  }

  /**
   * Generate the full projected depreciation schedule from a given start period.
   * Stops when remaining book value reaches residualValue.
   */
  static generateSchedule(params: {
    method: DepreciationMethod;
    acquisitionCost: number;
    residualValue: number;
    usefulLifeMonths: number;
    startYear: number;
    startMonth: number; // 1-based
  }): DepreciationPeriod[] {
    const { acquisitionCost, residualValue, usefulLifeMonths, method } = params;

    if (method === DepreciationMethod.UNITS_OF_PRODUCTION) {
      // Cannot project UoP without future unit data — return empty
      return [];
    }

    const schedule: DepreciationPeriod[] = [];
    let accumulated = 0;
    let bookValue = acquisitionCost;
    let year = params.startYear;
    let month = params.startMonth;

    for (let i = 0; i < usefulLifeMonths; i++) {
      const deprAmount = this.calculateMonthly({
        method,
        acquisitionCost,
        residualValue,
        usefulLifeMonths,
        currentBookValue: bookValue,
        accumulatedDepreciation: accumulated,
      });

      if (deprAmount <= 0) break;

      accumulated = Math.round((accumulated + deprAmount) * 100) / 100;
      bookValue = Math.max(Math.round((acquisitionCost - accumulated) * 100) / 100, residualValue);

      schedule.push({ year, month, depreciationAmount: deprAmount, accumulatedDepreciation: accumulated, bookValue });

      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }

    return schedule;
  }

  /** Compute accumulated depreciation from existing AssetDepreciation records (O(n)). */
  static sumAccumulated(depreciations: { depreciationAmount: { toNumber(): number } }[]): number {
    return depreciations.reduce((sum, d) => sum + d.depreciationAmount.toNumber(), 0);
  }
}
