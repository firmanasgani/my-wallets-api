import { Injectable } from '@nestjs/common';
import { ChartOfAccountType, Company, JournalEntryStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DateRangeQueryDto } from './dto/date-range-query.dto';
import { BalanceSheetQueryDto } from './dto/balance-sheet-query.dto';
import { JournalQueryDto } from './dto/journal-query.dto';

// COA types whose normal balance is DEBIT (balance = opening + debit - credit)
const DEBIT_NORMAL: ChartOfAccountType[] = [
  ChartOfAccountType.ASSET,
  ChartOfAccountType.EXPENSE,
];

// Phase 8: only APPROVED journal entries affect financial position
const APPROVED_ENTRY = { status: JournalEntryStatus.APPROVED } as const;

@Injectable()
export class FinancialReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── P&L ─────────────────────────────────────────────────────────────────

  async getProfitLoss(company: Company, dto: DateRangeQueryDto) {
    const { startDate, endDate } = dto;
    const dateFilter = this.buildDateFilter(startDate, endDate);

    const coas = await this.prisma.chartOfAccount.findMany({
      where: {
        companyId: company.id,
        type: { in: [ChartOfAccountType.REVENUE, ChartOfAccountType.EXPENSE] },
      },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: 'asc' },
    });

    const movements = await this.prisma.journalLine.groupBy({
      by: ['coaId', 'type'],
      where: {
        coaId: { in: coas.map((c) => c.id) },
        journalEntry: {
          companyId: company.id,
          ...APPROVED_ENTRY,
          ...(dateFilter ? { transactionDate: dateFilter } : {}),
        },
      },
      _sum: { amount: true },
    });

    const movMap = this.buildMovementMap(movements);

    const revenueAccounts: { coaCode: string; coaName: string; amount: string }[] = [];
    const expenseAccounts: { coaCode: string; coaName: string; amount: string }[] = [];
    let totalRevenue = 0;
    let totalExpense = 0;

    for (const coa of coas) {
      const mov = movMap[coa.id] ?? { debit: 0, credit: 0 };
      if (coa.type === ChartOfAccountType.REVENUE) {
        const amount = mov.credit - mov.debit;
        revenueAccounts.push({ coaCode: coa.code, coaName: coa.name, amount: this.fmt(amount) });
        totalRevenue += amount;
      } else {
        const amount = mov.debit - mov.credit;
        expenseAccounts.push({ coaCode: coa.code, coaName: coa.name, amount: this.fmt(amount) });
        totalExpense += amount;
      }
    }

    const netProfit = totalRevenue - totalExpense;

    return {
      period: { startDate: startDate ?? null, endDate: endDate ?? null },
      revenue: { accounts: revenueAccounts, total: this.fmt(totalRevenue) },
      expense: { accounts: expenseAccounts, total: this.fmt(totalExpense) },
      netProfit: this.fmt(netProfit),
      isProfit: netProfit >= 0,
    };
  }

  // ─── Balance Sheet ────────────────────────────────────────────────────────

  async getBalanceSheet(company: Company, dto: BalanceSheetQueryDto) {
    const asOfDate = dto.date ? new Date(dto.date) : new Date();
    asOfDate.setHours(23, 59, 59, 999);

    const coas = await this.prisma.chartOfAccount.findMany({
      where: { companyId: company.id },
      select: { id: true, code: true, name: true, type: true, openingBalance: true },
      orderBy: { code: 'asc' },
    });

    const movements = await this.prisma.journalLine.groupBy({
      by: ['coaId', 'type'],
      where: {
        coaId: { in: coas.map((c) => c.id) },
        journalEntry: {
          companyId: company.id,
          ...APPROVED_ENTRY,
          transactionDate: { lte: asOfDate },
        },
      },
      _sum: { amount: true },
    });

    const movMap = this.buildMovementMap(movements);

    type CoaRow = { coaCode: string; coaName: string; balance: string };
    const grouped: Record<ChartOfAccountType, CoaRow[]> = {
      ASSET: [], LIABILITY: [], EQUITY: [], REVENUE: [], EXPENSE: [],
    };
    const totals: Record<ChartOfAccountType, number> = {
      ASSET: 0, LIABILITY: 0, EQUITY: 0, REVENUE: 0, EXPENSE: 0,
    };

    for (const coa of coas) {
      const mov = movMap[coa.id] ?? { debit: 0, credit: 0 };
      const opening = coa.openingBalance.toNumber();
      const balance = DEBIT_NORMAL.includes(coa.type)
        ? opening + mov.debit - mov.credit
        : opening - mov.debit + mov.credit;

      grouped[coa.type].push({ coaCode: coa.code, coaName: coa.name, balance: this.fmt(balance) });
      totals[coa.type] += balance;
    }

    const currentPeriodProfit = totals.REVENUE - totals.EXPENSE;
    const totalEquity = totals.EQUITY + currentPeriodProfit;
    const totalLiabilitiesAndEquity = totals.LIABILITY + totalEquity;
    const isBalanced = Math.abs(totals.ASSET - totalLiabilitiesAndEquity) < 0.01;

    return {
      asOfDate: asOfDate.toISOString(),
      assets: { accounts: grouped.ASSET, total: this.fmt(totals.ASSET) },
      liabilities: { accounts: grouped.LIABILITY, total: this.fmt(totals.LIABILITY) },
      equity: {
        accounts: grouped.EQUITY,
        currentPeriodProfit: this.fmt(currentPeriodProfit),
        total: this.fmt(totalEquity),
      },
      totalLiabilitiesAndEquity: this.fmt(totalLiabilitiesAndEquity),
      isBalanced,
    };
  }

  // ─── Cash Flow ────────────────────────────────────────────────────────────

  async getCashFlow(company: Company, dto: DateRangeQueryDto) {
    const { startDate, endDate } = dto;
    const dateFilter = this.buildDateFilter(startDate, endDate);

    const assetCoas = await this.prisma.chartOfAccount.findMany({
      where: { companyId: company.id, type: ChartOfAccountType.ASSET },
      select: { id: true, code: true, name: true, openingBalance: true },
      orderBy: { code: 'asc' },
    });

    const openingCash = assetCoas.reduce((sum, c) => sum + c.openingBalance.toNumber(), 0);

    const movements = await this.prisma.journalLine.groupBy({
      by: ['coaId', 'type'],
      where: {
        coaId: { in: assetCoas.map((c) => c.id) },
        journalEntry: {
          companyId: company.id,
          ...APPROVED_ENTRY,
          ...(dateFilter ? { transactionDate: dateFilter } : {}),
        },
      },
      _sum: { amount: true },
    });

    const movMap = this.buildMovementMap(movements);

    const inflowItems: { coaCode: string; coaName: string; amount: string }[] = [];
    const outflowItems: { coaCode: string; coaName: string; amount: string }[] = [];
    let totalInflow = 0;
    let totalOutflow = 0;

    for (const coa of assetCoas) {
      const mov = movMap[coa.id] ?? { debit: 0, credit: 0 };
      if (mov.debit > 0) {
        inflowItems.push({ coaCode: coa.code, coaName: coa.name, amount: this.fmt(mov.debit) });
        totalInflow += mov.debit;
      }
      if (mov.credit > 0) {
        outflowItems.push({ coaCode: coa.code, coaName: coa.name, amount: this.fmt(mov.credit) });
        totalOutflow += mov.credit;
      }
    }

    const netCashFlow = totalInflow - totalOutflow;

    return {
      period: { startDate: startDate ?? null, endDate: endDate ?? null },
      openingCash: this.fmt(openingCash),
      cashInflows: inflowItems,
      totalInflow: this.fmt(totalInflow),
      cashOutflows: outflowItems,
      totalOutflow: this.fmt(totalOutflow),
      netCashFlow: this.fmt(netCashFlow),
      endingCash: this.fmt(openingCash + netCashFlow),
    };
  }

  // ─── General Journal ──────────────────────────────────────────────────────

  async getJournal(company: Company, dto: JournalQueryDto) {
    const { startDate, endDate } = dto;
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const dateFilter = this.buildDateFilter(startDate, endDate);

    // General journal shows only APPROVED entries (posted to ledger)
    const where = {
      companyId: company.id,
      ...APPROVED_ENTRY,
      ...(dateFilter ? { transactionDate: dateFilter } : {}),
    };

    const [entries, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        include: {
          lines: {
            include: {
              coa: { select: { id: true, code: true, name: true } },
              contact: { select: { id: true, name: true } },
            },
            orderBy: [{ type: 'asc' }, { amount: 'desc' }],
          },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
        orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    const data = entries.map((entry) => {
      const debitLines = entry.lines.filter((l) => l.type === 'DEBIT');
      const creditLines = entry.lines.filter((l) => l.type === 'CREDIT');
      const contactNames = [...new Set(entry.lines.filter((l) => l.contact).map((l) => l.contact!.name))];

      return {
        id: entry.id,
        date: entry.transactionDate,
        description: entry.description,
        reference: entry.invoice?.invoiceNumber ?? null,
        contacts: contactNames.length > 0 ? contactNames : null,
        isSystemGenerated: entry.isSystemGenerated,
        debitLines: debitLines.map((l) => ({
          coaCode: l.coa.code, coaName: l.coa.name,
          amount: l.amount.toString(), description: l.description ?? null,
          contact: l.contact?.name ?? null,
        })),
        creditLines: creditLines.map((l) => ({
          coaCode: l.coa.code, coaName: l.coa.name,
          amount: l.amount.toString(), description: l.description ?? null,
          contact: l.contact?.name ?? null,
        })),
        totalDebit: this.fmt(debitLines.reduce((s, l) => s + l.amount.toNumber(), 0)),
        totalCredit: this.fmt(creditLines.reduce((s, l) => s + l.amount.toNumber(), 0)),
      };
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private buildDateFilter(startDate?: string, endDate?: string) {
    if (!startDate && !endDate) return undefined;
    const filter: { gte?: Date; lte?: Date } = {};
    if (startDate) { const d = new Date(startDate); d.setHours(0, 0, 0, 0); filter.gte = d; }
    if (endDate) { const d = new Date(endDate); d.setHours(23, 59, 59, 999); filter.lte = d; }
    return filter;
  }

  private buildMovementMap(
    movements: { coaId: string; type: string; _sum: { amount: Prisma.Decimal | null } }[],
  ): Record<string, { debit: number; credit: number }> {
    const map: Record<string, { debit: number; credit: number }> = {};
    for (const mov of movements) {
      if (!map[mov.coaId]) map[mov.coaId] = { debit: 0, credit: 0 };
      const amount = mov._sum.amount?.toNumber() ?? 0;
      if (mov.type === 'DEBIT') map[mov.coaId].debit += amount;
      else map[mov.coaId].credit += amount;
    }
    return map;
  }

  private fmt(value: number): string {
    return value.toFixed(2);
  }
}
