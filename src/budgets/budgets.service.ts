import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { BudgetFilterDto } from './dto/budget-filter.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto'; // Need to create this too

@Injectable()
export class BudgetsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createBudgetDto: CreateBudgetDto) {
    const { categoryId, year, month, amount, description } = createBudgetDto;

    // Check user subscription plan and budget limit
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscriptions: {
          where: { status: SubscriptionStatus.ACTIVE },
          include: { plan: true },
          take: 1,
        },
      },
    });

    const activeSubscription = user?.subscriptions[0];
    const isFreePlan =
      !activeSubscription || activeSubscription.plan.code === 'FREE';

    if (isFreePlan) {
      const budgetCount = await this.prisma.budget.count({
        where: { userId },
      });

      if (budgetCount >= 10) {
        throw new BadRequestException(
          'Free plan users can only create up to 10 budgets. Please upgrade to create more.',
        );
      }
    }

    // Verify category ownership
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    try {
      const budget = await this.prisma.budget.create({
        data: {
          userId,
          categoryId,
          year,
          month,
          amount,
          description,
        },
        include: {
          category: true,
        },
      });
      return budget;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'Budget for this category, month, and year already exists',
        );
      }
      throw error;
    }
  }

  async findAll(userId: string, filter: BudgetFilterDto) {
    const { year, month, categoryId } = filter;

    return this.prisma.budget.findMany({
      where: {
        userId,
        ...(year && { year }),
        ...(month && { month }),
        ...(categoryId && { categoryId }),
      },
      include: {
        category: true,
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async findOne(id: string, userId: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, userId },
      include: { category: true },
    });

    if (!budget) {
      throw new NotFoundException('Budget not found');
    }

    return budget;
  }

  async update(id: string, userId: string, updateBudgetDto: UpdateBudgetDto) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, userId },
    });

    if (!budget) {
      throw new NotFoundException('Budget not found');
    }

    // Check uniqueness if changing year/month/category?
    // For now assuming updateBudgetDto only updates amount/description to keep it simple,
    // or if year/month change, handle P2002.

    try {
      return await this.prisma.budget.update({
        where: { id },
        data: updateBudgetDto,
        include: { category: true },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'Budget for this category, month, and year already exists',
        );
      }
      throw error;
    }
  }

  async remove(id: string, userId: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, userId },
    });

    if (!budget) {
      throw new NotFoundException('Budget not found');
    }

    return this.prisma.budget.delete({
      where: { id },
    });
  }

  async getBudgetReport(userId: string, year: number, month: number) {
    // 1. Get all budgets for the period
    const budgets = await this.prisma.budget.findMany({
      where: { userId, year, month },
      include: { category: true },
    });

    // 2. Get transaction aggregates for the period
    // Helper to get start and end of month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const transactionAggregates = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        transactionDate: {
          gte: startDate,
          lte: endDate,
        },
        // We only care about expenses mostly, but user said "Budget can be taken from income or expense".
        // Usually budget vs actual implies:
        // Expense Budget vs Expense Trx
        // Income Budget vs Income Trx
        // So we should sum based on type too?
        // But budgets are linked to Categories, which have types.
        // So simply summing per category is enough.
        categoryId: {
          not: null,
        },
      },
      _sum: {
        amount: true,
      },
    });

    // Map aggregates to a dictionary for easy lookup
    const spentMap = new Map<string, number>();
    transactionAggregates.forEach((agg) => {
      if (agg.categoryId) {
        spentMap.set(agg.categoryId, agg._sum.amount?.toNumber() || 0);
      }
    });

    // 3. Merge
    const report = budgets.map((budget) => {
      const spent = spentMap.get(budget.categoryId) || 0;
      const remaining = budget.amount.toNumber() - spent;
      return {
        ...budget,
        spent,
        remaining,
        percentage:
          budget.amount.toNumber() > 0
            ? (spent / budget.amount.toNumber()) * 100
            : 0,
      };
    });

    // Also include categories that have NO budget but HAVE transactions (Unbudgeted spending)?
    // The user didn't explicitly ask for this, but it's good practice.
    // For now, I'll stick to the requested "Budget Report" which usually focuses on the items you budgeted for.

    return report;
  }
}
