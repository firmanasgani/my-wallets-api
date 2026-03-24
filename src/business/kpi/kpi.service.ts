import { Injectable } from '@nestjs/common';
import { ChartOfAccountType, Company, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class KpiService {
  constructor(private prisma: PrismaService) {}

  async getKpiDashboard(company: Company) {
    const now = new Date();
    const curRange = this.monthRange(now);
    const prevRange = this.monthRange(
      new Date(now.getFullYear(), now.getMonth() - 1, 1),
    );

    // ── Load COA lists ───────────────────────────────────────────
    const [revExpCoas, liquidityCoas] = await Promise.all([
      this.prisma.chartOfAccount.findMany({
        where: {
          companyId: company.id,
          type: {
            in: [ChartOfAccountType.REVENUE, ChartOfAccountType.EXPENSE],
          },
        },
        select: { id: true, code: true, name: true, type: true },
      }),
      this.prisma.chartOfAccount.findMany({
        where: {
          companyId: company.id,
          code: { in: ['1-001', '1-002', '1-003', '2-001'] },
        },
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          openingBalance: true,
        },
      }),
    ]);

    const revCoas = revExpCoas.filter(
      (c) => c.type === ChartOfAccountType.REVENUE,
    );
    const expCoas = revExpCoas.filter(
      (c) => c.type === ChartOfAccountType.EXPENSE,
    );

    // ── Run all queries in parallel ──────────────────────────────
    const [
      curMovements,
      prevRevMovements,
      liqMovements,
      sentThisMonth,
      paidThisMonth,
      overdueAgg,
      outstandingAgg,
    ] = await Promise.all([
      // 1. Current month movements — REVENUE + EXPENSE COAs
      this.prisma.journalLine.groupBy({
        by: ['coaId', 'type'],
        where: {
          coaId: { in: revExpCoas.map((c) => c.id) },
          journalEntry: {
            companyId: company.id,
            transactionDate: curRange,
          },
        },
        _sum: { amount: true },
      }),

      // 2. Previous month movements — REVENUE COAs only (for growth)
      this.prisma.journalLine.groupBy({
        by: ['coaId', 'type'],
        where: {
          coaId: { in: revCoas.map((c) => c.id) },
          journalEntry: {
            companyId: company.id,
            transactionDate: prevRange,
          },
        },
        _sum: { amount: true },
      }),

      // 3. All-time movements for liquidity COAs (cumulative balance)
      this.prisma.journalLine.groupBy({
        by: ['coaId', 'type'],
        where: {
          coaId: { in: liquidityCoas.map((c) => c.id) },
          journalEntry: { companyId: company.id },
        },
        _sum: { amount: true },
      }),

      // 4. Invoice: count SENT this month
      this.prisma.invoice.count({
        where: {
          companyId: company.id,
          sentAt: curRange,
        },
      }),

      // 5. Invoice: count PAID this month
      this.prisma.invoice.count({
        where: {
          companyId: company.id,
          status: InvoiceStatus.PAID,
          paidAt: curRange,
        },
      }),

      // 6. Invoice: OVERDUE aggregate (all-time current state)
      this.prisma.invoice.aggregate({
        where: { companyId: company.id, status: InvoiceStatus.OVERDUE },
        _count: { id: true },
        _sum: { totalAmount: true },
      }),

      // 7. Invoice: outstanding (SENT + OVERDUE) aggregate
      this.prisma.invoice.aggregate({
        where: {
          companyId: company.id,
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    // ── Build movement maps ──────────────────────────────────────
    const curMovMap = this.buildMovMap(curMovements);
    const prevMovMap = this.buildMovMap(prevRevMovements);
    const liqMovMap = this.buildMovMap(liqMovements);

    // ── Profitability ────────────────────────────────────────────
    let totalRevenue = 0;
    let totalExpense = 0;
    const topRevArr: { coaCode: string; coaName: string; amount: string }[] =
      [];
    const topExpArr: { coaCode: string; coaName: string; amount: string }[] =
      [];

    for (const coa of revCoas) {
      const mov = curMovMap[coa.id] ?? { debit: 0, credit: 0 };
      const amount = mov.credit - mov.debit; // REVENUE: normal balance = credit
      totalRevenue += amount;
      topRevArr.push({ coaCode: coa.code, coaName: coa.name, amount: this.fmt(amount) });
    }

    for (const coa of expCoas) {
      const mov = curMovMap[coa.id] ?? { debit: 0, credit: 0 };
      const amount = mov.debit - mov.credit; // EXPENSE: normal balance = debit
      totalExpense += amount;
      topExpArr.push({ coaCode: coa.code, coaName: coa.name, amount: this.fmt(amount) });
    }

    topRevArr.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));
    topExpArr.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));

    const netProfit = totalRevenue - totalExpense;
    const profitMargin =
      totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    let prevRevenue = 0;
    for (const coa of revCoas) {
      const mov = prevMovMap[coa.id] ?? { debit: 0, credit: 0 };
      prevRevenue += mov.credit - mov.debit;
    }
    const revenueGrowth =
      prevRevenue > 0
        ? ((totalRevenue - prevRevenue) / prevRevenue) * 100
        : null;

    // ── Liquidity ────────────────────────────────────────────────
    let cashPosition = 0;
    let totalReceivable = 0;
    let totalPayable = 0;

    for (const coa of liquidityCoas) {
      const mov = liqMovMap[coa.id] ?? { debit: 0, credit: 0 };
      const opening = coa.openingBalance.toNumber();
      // ASSET: debit normal → balance = opening + debit - credit
      // LIABILITY: credit normal → balance = opening - debit + credit
      const balance =
        coa.type === ChartOfAccountType.ASSET
          ? opening + mov.debit - mov.credit
          : opening - mov.debit + mov.credit;

      if (coa.code === '1-001' || coa.code === '1-002') cashPosition += balance;
      else if (coa.code === '1-003') totalReceivable += balance;
      else if (coa.code === '2-001') totalPayable += balance;
    }

    // ── Response ─────────────────────────────────────────────────
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
        outstandingAmount: this.fmt(
          outstandingAgg._sum.totalAmount?.toNumber() ?? 0,
        ),
      },
      breakdown: {
        topRevenueAccounts: topRevArr.slice(0, 5),
        topExpenseAccounts: topExpArr.slice(0, 5),
      },
    };
  }

  // ── Private Helpers ──────────────────────────────────────────

  private monthRange(date: Date) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    return { gte: start, lte: end };
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
