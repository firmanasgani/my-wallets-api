import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Helper: Validate Premium Access ---
  private async ensurePremium(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionPlan: true },
    });
    if (!user || user.subscriptionPlan === 'FREE') {
      throw new ForbiddenException(
        'Upgrade to Premium to access detailed reports.',
      );
    }
  }

  // --- 1. Ringkasan Keuangan ---
  async getSummary(userId: string, startDate?: string, endDate?: string) {
    await this.ensurePremium(userId);

    const start = startDate ? new Date(startDate) : new Date(0); // Default all time if not set (but discouraged)
    const end = endDate ? new Date(endDate) : new Date();

    const aggregations = await this.prisma.transaction.groupBy({
      by: ['transactionType'],
      where: {
        userId,
        transactionDate: { gte: start, lte: end },
      },
      _sum: { amount: true },
    });

    let totalIncome = 0;
    let totalExpense = 0;

    aggregations.forEach((agg) => {
      const amount = agg._sum.amount ? Number(agg._sum.amount) : 0;
      if (agg.transactionType === TransactionType.INCOME) totalIncome += amount;
      if (agg.transactionType === TransactionType.EXPENSE)
        totalExpense += amount;
    });

    const netCashFlow = totalIncome - totalExpense;
    const savingsRate =
      totalIncome > 0 ? ((netCashFlow / totalIncome) * 100).toFixed(1) : 0;

    return {
      period: { start, end },
      totalIncome,
      totalExpense,
      netCashFlow,
      savingsRate: Number(savingsRate),
    };
  }

  // --- 2. Breakdown Kategori (Pie Chart) ---
  async getCategoryBreakdown(
    userId: string,
    type: TransactionType = TransactionType.EXPENSE,
    startDate?: string,
    endDate?: string,
  ) {
    await this.ensurePremium(userId);
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const groupBy = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        transactionType: type,
        ...(start && { transactionDate: { gte: start } }),
        ...(end && { transactionDate: { lte: end } }),
        categoryId: { not: null }, // Only aggregated valid categories
      },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    // Fetch Category Details (Name, Icon, Color)
    const categoryIds = groupBy.map((g) => g.categoryId).filter((id) => id); // Ensure no nulls
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds as string[] } },
    });

    const totalAmount = groupBy.reduce(
      (sum, item) => sum + Number(item._sum.amount || 0),
      0,
    );

    return groupBy.map((item) => {
      const cat = categories.find((c) => c.id === item.categoryId);
      const amount = Number(item._sum.amount || 0);
      return {
        categoryId: item.categoryId,
        categoryName: cat?.categoryName || 'Unknown',
        icon: cat?.icon,
        color: cat?.color,
        totalAmount: amount,
        percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0,
        transactionCount: item._count.id,
      };
    });
  }

  // --- 3. Analisis Tren Global (Line Chart: Income vs Expense) ---
  async getTrend(
    userId: string,
    interval: 'DAY' | 'MONTH' = 'MONTH',
    startDate?: string,
    endDate?: string,
    type?: TransactionType,
    categoryId?: string,
  ) {
    await this.ensurePremium(userId);

    // Default range: 6 months back if not provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setMonth(end.getMonth() - 6));

    // Prisma doesn't support DateTrunc easily in groupBy without raw query.
    // For simplicity & database compatibility (Postgres), we use $queryRaw.
    // However, to keep it clean and provider-agnostic, fetching aggregated data per day/month is safer
    // but might require post-processing.
    // Let's use a simpler approach: groupBy transactionType and raw date, then map in JS.
    // BUT for "Trend", we need time-series.
    // Let's use Raw Query for performance on large datasets.

    const validInterval = interval === 'DAY' ? 'day' : 'month';
    const dateFormat = interval === 'DAY' ? 'YYYY-MM-DD' : 'YYYY-MM';

    // Construct Where Clause for filtering
    let filterClause = `AND "userId" = '${userId}' AND "transactionDate" >= '${start.toISOString()}' AND "transactionDate" <= '${end.toISOString()}'`;
    if (type) filterClause += ` AND "transactionType" = '${type}'`;
    if (categoryId) filterClause += ` AND "categoryId" = '${categoryId}'`;

    const rawData: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT 
            TO_CHAR("transactionDate", '${dateFormat}') as "time_key",
            "transactionType",
            SUM("amount") as "total_amount"
        FROM "Transaction"
        WHERE 1=1 ${filterClause}
        GROUP BY "time_key", "transactionType"
        ORDER BY "time_key" ASC
    `);

    // Prepare Labels & Datasets
    const labels = [...new Set(rawData.map((r) => r.time_key))].sort();
    const incomeData = labels.map((label) => {
      const found = rawData.find(
        (r) =>
          r.time_key === label && r.transactionType === TransactionType.INCOME,
      );
      return found ? Number(found.total_amount) : 0;
    });
    const expenseData = labels.map((label) => {
      const found = rawData.find(
        (r) =>
          r.time_key === label && r.transactionType === TransactionType.EXPENSE,
      );
      return found ? Number(found.total_amount) : 0;
    });

    // If specific type selected, return only that dataset + appropriate label
    if (type === TransactionType.INCOME) {
      return {
        labels,
        datasets: [
          {
            label: 'Income',
            borderColor: '#10B981',
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            data: incomeData,
          },
        ],
      };
    } else if (type === TransactionType.EXPENSE) {
      return {
        labels,
        datasets: [
          {
            label: 'Expense',
            borderColor: '#EF4444',
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            data: expenseData,
          },
        ],
      };
    }

    // Default: Both + Net
    const netData = incomeData.map((inc, i) => inc - expenseData[i]);
    return {
      labels,
      datasets: [
        {
          label: 'Income',
          borderColor: '#10B981',
          data: incomeData,
        },
        {
          label: 'Expense',
          borderColor: '#EF4444',
          data: expenseData,
        },
        {
          label: 'Net Cashflow',
          borderColor: '#3B82F6',
          type: 'line',
          data: netData,
        },
      ],
    };
  }

  // --- 4. Tren Kategori (Stacked Bar) ---
  async getCategoryTrend(
    userId: string,
    type: TransactionType, // Required (Income / Expense)
    interval: 'DAY' | 'MONTH' = 'MONTH',
    startDate?: string,
    endDate?: string,
  ) {
    await this.ensurePremium(userId);

    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setMonth(end.getMonth() - 6));

    const dateFormat = interval === 'DAY' ? 'YYYY-MM-DD' : 'YYYY-MM';

    // 1. Get Top Categories first (to limit stack clutter)
    const topCategories = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        transactionType: type,
        transactionDate: { gte: start, lte: end },
        categoryId: { not: null },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5, // Top 5 only
    });

    const topCategoryIds = topCategories
      .map((c) => c.categoryId)
      .filter((id) => id !== null) as string[];

    // 2. Fetch Aggregated Data over time
    const rawData: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT 
            TO_CHAR("transactionDate", '${dateFormat}') as "time_key",
            "categoryId",
            SUM("amount") as "total_amount"
        FROM "Transaction"
        WHERE "userId" = '${userId}' 
          AND "transactionType" = '${type}'
          AND "transactionDate" >= '${start.toISOString()}'
          AND "transactionDate" <= '${end.toISOString()}'
        GROUP BY "time_key", "categoryId"
        ORDER BY "time_key" ASC
    `);

    // 3. Process Data
    const labels = [...new Set(rawData.map((r) => r.time_key))].sort();

    // Fetch Category Names
    const categoriesInfo = await this.prisma.category.findMany({
      where: { id: { in: topCategoryIds } },
    });

    // Build Datasets for Top Categories
    const datasets = topCategoryIds.map((catId) => {
      const catInfo = categoriesInfo.find((c) => c.id === catId);
      const data = labels.map((label) => {
        const found = rawData.find(
          (r) => r.time_key === label && r.categoryId === catId,
        );
        return found ? Number(found.total_amount) : 0;
      });

      return {
        label: catInfo?.categoryName || 'Unknown',
        backgroundColor: catInfo?.color || '#888888',
        data,
      };
    });

    // Build "Others" Dataset
    const othersData = labels.map((label) => {
      const itemsInPeriod = rawData.filter(
        (r) => r.time_key === label && !topCategoryIds.includes(r.categoryId),
      );
      return itemsInPeriod.reduce(
        (sum, item) => sum + Number(item.total_amount),
        0,
      );
    });

    if (othersData.some((val) => val > 0)) {
      datasets.push({
        label: 'Lainnya',
        backgroundColor: '#CCCCCC',
        data: othersData,
      });
    }

    return { labels, datasets };
  }

  // --- 5. Perbandingan (Comparison) ---
  async getComparison(
    userId: string,
    month: number,
    year: number,
    target: 'ALL' | 'INCOME' | 'EXPENSE' = 'ALL',
  ) {
    await this.ensurePremium(userId);

    const currentStart = new Date(year, month - 1, 1);
    const currentEnd = new Date(year, month, 0); // End of month

    const prevMonth = month - 1 === 0 ? 12 : month - 1;
    const prevYear = month - 1 === 0 ? year - 1 : year;
    const prevStart = new Date(prevYear, prevMonth - 1, 1);
    const prevEnd = new Date(prevYear, prevMonth, 0);

    const fetchData = async (start: Date, end: Date, type: TransactionType) => {
      const agg = await this.prisma.transaction.aggregate({
        where: {
          userId,
          transactionType: type,
          transactionDate: { gte: start, lte: end },
        },
        _sum: { amount: true },
      });
      return Number(agg._sum.amount || 0);
    };

    const processComparison = async (type: TransactionType) => {
      const current = await fetchData(currentStart, currentEnd, type);
      const previous = await fetchData(prevStart, prevEnd, type);
      const difference = current - previous;
      const percentageChange =
        previous === 0 ? 100 : (difference / previous) * 100;

      let status = 'STAGNANT';
      if (difference > 0) status = 'INCREASED';
      if (difference < 0) status = 'DECREASED';

      let message = '';
      const pctStr = Math.abs(percentageChange).toFixed(1) + '%';
      if (type === TransactionType.INCOME) {
        if (status === 'INCREASED')
          message = `Asik! Pemasukanmu naik ${pctStr} dibanding bulan lalu.`;
        if (status === 'DECREASED')
          message = `Yah, pemasukanmu turun ${pctStr}. Tetap semangat!`;
      } else {
        if (status === 'INCREASED')
          message = `Waspada, pengeluaranmu naik ${pctStr}.`;
        if (status === 'DECREASED')
          message = `Mantap! Kamu berhasil hemat ${pctStr} bulan ini.`;
      }

      return {
        current,
        previous,
        difference,
        percentageChange: Number(percentageChange.toFixed(1)),
        status,
        message,
      };
    };

    const response: any = {
      period: {
        current: `${year}-${month.toString().padStart(2, '0')}`,
        previous: `${prevYear}-${prevMonth.toString().padStart(2, '0')}`,
      },
    };

    if (target === 'ALL' || target === 'INCOME') {
      response.income = await processComparison(TransactionType.INCOME);
    }
    if (target === 'ALL' || target === 'EXPENSE') {
      response.expense = await processComparison(TransactionType.EXPENSE);
    }

    return response;
  }

  // --- 6. Budget Health ---
  async getBudgetHealth(userId: string, month: number, year: number) {
    await this.ensurePremium(userId);

    // 1. Get Budgets
    const budgets = await this.prisma.budget.findMany({
      where: { userId, month, year },
      include: { category: true },
    });

    if (budgets.length === 0) return [];

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const results: any[] = [];

    for (const budget of budgets) {
      // Calculate actual usage
      const usage = await this.prisma.transaction.aggregate({
        where: {
          userId,
          categoryId: budget.categoryId,
          transactionDate: { gte: startDate, lte: endDate },
          transactionType: TransactionType.EXPENSE,
        },
        _sum: { amount: true },
      });

      const actualSpent = Number(usage._sum.amount || 0);
      const budgetAmount = Number(budget.amount);
      const pct = (actualSpent / budgetAmount) * 100;

      let status = 'SAFE';
      if (pct >= 80) status = 'WARNING';
      if (pct > 100) status = 'EXCEEDED';

      results.push({
        categoryName: budget.category.categoryName,
        budgetAmount,
        actualSpent,
        remaining: budgetAmount - actualSpent,
        usagePercentage: Number(pct.toFixed(1)),
        status,
      });
    }

    return results.sort((a, b) => b.usagePercentage - a.usagePercentage);
  }

  // --- 7. Insights (Rule Based) ---
  async getInsights(userId: string, month: number, year: number) {
    await this.ensurePremium(userId);
    const insights: any[] = [];

    // Fetch Summary Logic
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0).toISOString();

    const summary = await this.getSummary(userId, startDate, endDate);

    // Rule 1: Boros Alert
    if (
      summary.totalIncome > 0 &&
      summary.totalExpense > 0.8 * summary.totalIncome
    ) {
      insights.push({
        type: 'WARNING',
        title: 'Boros Alert',
        message: `⚠️ Hati-hati! Kamu sudah menghabiskan ${((summary.totalExpense / summary.totalIncome) * 100).toFixed(0)}% dari penghasilanmu bulan ini.`,
      });
    }

    // Rule 2: Savings Opportunity
    if (summary.netCashFlow > 0.2 * summary.totalIncome) {
      insights.push({
        type: 'TIP',
        title: 'Saran Tabungan',
        message: `💰 Kerja bagus! Kamu punya sisa dana **Rp ${summary.netCashFlow.toLocaleString()}**. Yuk tabung atau investasikan!`,
      });
    }

    // Rule 3: Category Dominance
    const breakdown = await this.getCategoryBreakdown(
      userId,
      TransactionType.EXPENSE,
      startDate,
      endDate,
    );
    if (breakdown.length > 0) {
      const top = breakdown[0];
      if (top.percentage > 30) {
        insights.push({
          type: 'WARNING',
          title: 'Dominasi Pengeluaran',
          message: `📊 Pengeluaran **${top.categoryName}** mendominasi **${top.percentage.toFixed(0)}%** total pengeluaranmu. Coba evaluasi pos ini.`,
        });
      }
    }

    // Rule 4: Budget Danger
    const budgets = await this.getBudgetHealth(userId, month, year);
    const dangerBudget = budgets.find((b) => b.status !== 'SAFE');
    if (dangerBudget) {
      if (dangerBudget.status === 'EXCEEDED') {
        insights.push({
          type: 'DANGER',
          title: 'Budget Jebol',
          message: `🛑 Budget **${dangerBudget.categoryName}** sudah over **${(dangerBudget.usagePercentage - 100).toFixed(0)}%**!`,
        });
      } else {
        insights.push({
          type: 'WARNING',
          title: 'Budget Menipis',
          message: `🚨 Budget **${dangerBudget.categoryName}** tinggal sedikit lagi. Rem sedikit penggunaannya ya.`,
        });
      }
    }

    return insights;
  }
}
