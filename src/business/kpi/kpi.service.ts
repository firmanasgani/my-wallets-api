import { Injectable } from '@nestjs/common';
import {
  ChartOfAccountSubType,
  ChartOfAccountType,
  Company,
  InvoiceStatus,
  JournalEntryStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Only APPROVED journal entries count toward financials
const APPROVED_ENTRY = { status: JournalEntryStatus.APPROVED } as const;

@Injectable()
export class KpiService {
  constructor(private readonly prisma: PrismaService) {}

  async getKpiDashboard(company: Company) {
    const now = new Date();
    const curRange = this.monthRange(now);
    const prevRange = this.monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    // ── Load COA lists ──────────────────────────────────────────────────────
    const [allRevExpCoas, liquidityCoas] = await Promise.all([
      this.prisma.chartOfAccount.findMany({
        where: {
          companyId: company.id,
          type: { in: [ChartOfAccountType.REVENUE, ChartOfAccountType.EXPENSE] },
        },
        select: { id: true, code: true, name: true, type: true, subType: true },
      }),
      this.prisma.chartOfAccount.findMany({
        where: { companyId: company.id, code: { in: ['1-001', '1-002', '1-003', '2-001'] } },
        select: { id: true, code: true, name: true, type: true, openingBalance: true },
      }),
    ]);

    const revCoas = allRevExpCoas.filter((c) => c.type === ChartOfAccountType.REVENUE);
    const expCoas = allRevExpCoas.filter((c) => c.type === ChartOfAccountType.EXPENSE);

    // ── Run all DB queries in parallel ──────────────────────────────────────
    const [
      curMovements,
      prevRevMovements,
      liqMovements,
      sentThisMonth,
      paidThisMonth,
      overdueAgg,
      outstandingAgg,
    ] = await Promise.all([
      // 1. Current month movements — REVENUE + EXPENSE COAs (APPROVED only)
      this.prisma.journalLine.groupBy({
        by: ['coaId', 'type'],
        where: {
          coaId: { in: allRevExpCoas.map((c) => c.id) },
          journalEntry: { companyId: company.id, transactionDate: curRange, ...APPROVED_ENTRY },
        },
        _sum: { amount: true },
      }),

      // 2. Previous month REVENUE movements (for growth calc)
      this.prisma.journalLine.groupBy({
        by: ['coaId', 'type'],
        where: {
          coaId: { in: revCoas.map((c) => c.id) },
          journalEntry: { companyId: company.id, transactionDate: prevRange, ...APPROVED_ENTRY },
        },
        _sum: { amount: true },
      }),

      // 3. All-time movements for liquidity COAs (cumulative balance)
      this.prisma.journalLine.groupBy({
        by: ['coaId', 'type'],
        where: {
          coaId: { in: liquidityCoas.map((c) => c.id) },
          journalEntry: { companyId: company.id, ...APPROVED_ENTRY },
        },
        _sum: { amount: true },
      }),

      // 4–7. Invoice stats (unchanged)
      this.prisma.invoice.count({ where: { companyId: company.id, sentAt: curRange } }),
      this.prisma.invoice.count({ where: { companyId: company.id, status: InvoiceStatus.PAID, paidAt: curRange } }),
      this.prisma.invoice.aggregate({
        where: { companyId: company.id, status: InvoiceStatus.OVERDUE },
        _count: { id: true }, _sum: { totalAmount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { companyId: company.id, status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] } },
        _sum: { totalAmount: true },
      }),
    ]);

    // ── Build movement maps ─────────────────────────────────────────────────
    const curMovMap = this.buildMovMap(curMovements);
    const prevMovMap = this.buildMovMap(prevRevMovements);
    const liqMovMap = this.buildMovMap(liqMovements);

    // ── Profitability (existing) ────────────────────────────────────────────
    let totalRevenue = 0;
    let totalExpense = 0;
    const topRevArr: { coaCode: string; coaName: string; amount: string }[] = [];
    const topExpArr: { coaCode: string; coaName: string; amount: string }[] = [];

    for (const coa of revCoas) {
      const mov = curMovMap[coa.id] ?? { debit: 0, credit: 0 };
      const amount = mov.credit - mov.debit;
      totalRevenue += amount;
      topRevArr.push({ coaCode: coa.code, coaName: coa.name, amount: this.fmt(amount) });
    }

    for (const coa of expCoas) {
      const mov = curMovMap[coa.id] ?? { debit: 0, credit: 0 };
      const amount = mov.debit - mov.credit;
      totalExpense += amount;
      topExpArr.push({ coaCode: coa.code, coaName: coa.name, amount: this.fmt(amount) });
    }

    topRevArr.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));
    topExpArr.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));

    const netProfit = totalRevenue - totalExpense;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    let prevRevenue = 0;
    for (const coa of revCoas) {
      const mov = prevMovMap[coa.id] ?? { debit: 0, credit: 0 };
      prevRevenue += mov.credit - mov.debit;
    }
    const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null;

    // ── P&L Detail (Phase 8) — classified by subType ──────────────────────
    let operatingRevenue = 0;
    let costOfGoodsSold = 0;
    let operatingExpenses = 0;
    let nonOperatingIncome = 0;
    let nonOperatingExpenses = 0;

    for (const coa of revCoas) {
      const mov = curMovMap[coa.id] ?? { debit: 0, credit: 0 };
      const amount = mov.credit - mov.debit;
      if (coa.subType === ChartOfAccountSubType.OPERATING) operatingRevenue += amount;
      else if (coa.subType === ChartOfAccountSubType.NON_OPERATING) nonOperatingIncome += amount;
    }

    for (const coa of expCoas) {
      const mov = curMovMap[coa.id] ?? { debit: 0, credit: 0 };
      const amount = mov.debit - mov.credit;
      if (coa.subType === ChartOfAccountSubType.COGS) costOfGoodsSold += amount;
      else if (coa.subType === ChartOfAccountSubType.OPERATING) operatingExpenses += amount;
      else if (coa.subType === ChartOfAccountSubType.NON_OPERATING) nonOperatingExpenses += amount;
    }

    const grossProfit = operatingRevenue - costOfGoodsSold;
    // Laba Bersih = Laba Kotor - Beban Usaha + Penghasilan Luar Usaha - Beban Luar Usaha
    const netProfitDetail = grossProfit - operatingExpenses + nonOperatingIncome - nonOperatingExpenses;

    // ── Liquidity ──────────────────────────────────────────────────────────
    let cashPosition = 0;
    let totalReceivable = 0;
    let totalPayable = 0;

    for (const coa of liquidityCoas) {
      const mov = liqMovMap[coa.id] ?? { debit: 0, credit: 0 };
      const opening = coa.openingBalance.toNumber();
      const balance = coa.type === ChartOfAccountType.ASSET
        ? opening + mov.debit - mov.credit
        : opening - mov.debit + mov.credit;

      if (coa.code === '1-001' || coa.code === '1-002') cashPosition += balance;
      else if (coa.code === '1-003') totalReceivable += balance;
      else if (coa.code === '2-001') totalPayable += balance;
    }

    return {
      profitability: {
        period: { month: now.getMonth() + 1, year: now.getFullYear() },
        totalRevenue: this.fmt(totalRevenue),
        totalExpense: this.fmt(totalExpense),
        netProfit: this.fmt(netProfit),
        isProfit: netProfit >= 0,
        profitMargin: this.fmt(profitMargin),
        revenueGrowth: revenueGrowth !== null ? this.fmt(revenueGrowth) : null,
      },
      // Phase 8: structured P&L detail
      profitLossDetail: {
        period: { month: now.getMonth() + 1, year: now.getFullYear() },
        operatingRevenue: this.fmt(operatingRevenue),
        costOfGoodsSold: this.fmt(costOfGoodsSold),
        grossProfit: this.fmt(grossProfit),
        isGrossProfit: grossProfit >= 0,
        operatingExpenses: this.fmt(operatingExpenses),
        nonOperatingIncome: this.fmt(nonOperatingIncome),
        nonOperatingExpenses: this.fmt(nonOperatingExpenses),
        netProfit: this.fmt(netProfitDetail),
        isNetProfit: netProfitDetail >= 0,
        note: allRevExpCoas.every((c) => c.subType === null)
          ? 'Set subType on COA accounts to enable P&L detail breakdown.'
          : null,
      },
      liquidity: {
        cashPosition: this.fmt(cashPosition),
        totalReceivable: this.fmt(totalReceivable),
        totalPayable: this.fmt(totalPayable),
      },
      invoiceActivity: {
        totalSentThisMonth: sentThisMonth,
        totalPaidThisMonth: paidThisMonth,
        totalOverdue: overdueAgg._count.id,
        overdueAmount: this.fmt(overdueAgg._sum.totalAmount?.toNumber() ?? 0),
        outstandingAmount: this.fmt(outstandingAgg._sum.totalAmount?.toNumber() ?? 0),
      },
      breakdown: {
        topRevenueAccounts: topRevArr.slice(0, 5),
        topExpenseAccounts: topExpArr.slice(0, 5),
      },
    };
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private monthRange(date: Date) {
    return {
      gte: new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0),
      lte: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }

  private buildMovMap(
    rows: { coaId: string; type: string; _sum: { amount: any } }[],
  ): Record<string, { debit: number; credit: number }> {
    const map: Record<string, { debit: number; credit: number }> = {};
    for (const row of rows) {
      if (!map[row.coaId]) map[row.coaId] = { debit: 0, credit: 0 };
      const amt = row._sum.amount?.toNumber() ?? 0;
      if (row.type === 'DEBIT') map[row.coaId].debit += amt;
      else map[row.coaId].credit += amt;
    }
    return map;
  }

  private fmt(value: number): string {
    return value.toFixed(2);
  }
}
