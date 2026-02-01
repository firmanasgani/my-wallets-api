import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  RecurringInterval,
  TransactionType,
  RecurringStatus,
} from '@prisma/client';

@Injectable()
export class RecurringTransactionsService {
  private readonly logger = new Logger(RecurringTransactionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, createDto: CreateRecurringTransactionDto) {
    const {
      amount,
      categoryId,
      description,
      destinationAccountId,
      endDate,
      interval,
      sourceAccountId,
      transactionDate,
      startDate,
      transactionType,
    } = createDto;

    const effectiveStartDate = startDate || transactionDate;

    if (!effectiveStartDate) {
      throw new BadRequestException(
        'Either startDate or transactionDate must be provided',
      );
    }

    // 1. Create the RecurringTransaction record
    const recurringTransaction = await this.prisma.recurringTransaction.create({
      data: {
        userId,
        transactionType,
        amount,
        description,
        categoryId,
        sourceAccountId,
        destinationAccountId,
        interval,
        startDate: new Date(effectiveStartDate),
        endDate: endDate ? new Date(endDate) : null,
        nextRunDate: this.calculateNextRunDate(
          new Date(effectiveStartDate),
          interval,
        ),
        lastRunDate: new Date(effectiveStartDate),
      },
    });

    // 2. Create the first immediate Transaction
    await this.prisma.transaction.create({
      data: {
        userId,
        transactionType,
        amount,
        description,
        categoryId,
        sourceAccountid: sourceAccountId,
        destinationAccountId: destinationAccountId,
        transactionDate: new Date(effectiveStartDate),
        recurringTransactionId: recurringTransaction.id,
      },
    });

    await this.handleBalanceUpdate(
      userId,
      transactionType,
      amount,
      sourceAccountId,
      destinationAccountId,
    );

    return recurringTransaction;
  }

  async findAll(userId: string) {
    return this.prisma.recurringTransaction.findMany({
      where: { userId },
      include: {
        category: true,
        sourceAccount: true,
        destinationAccount: true,
      },
      orderBy: [
        { status: 'asc' }, // Active first (usually A comes before I, wait. Active=A, Inactive=I. Yes.)
        { createdAt: 'desc' },
      ],
    });
  }

  async findOne(userId: string, id: string) {
    const transaction = await this.prisma.recurringTransaction.findFirst({
      where: { id, userId },
      include: {
        category: true,
        sourceAccount: true,
        destinationAccount: true,
        transactions: {
          orderBy: { transactionDate: 'desc' },
          take: 10, // Show last 10 executions
        },
      },
    });

    if (!transaction) {
      throw new BadRequestException('Recurring transaction not found');
    }

    return transaction;
  }

  async remove(userId: string, id: string) {
    // Ensure the user owns the recurring transaction
    const rt = await this.prisma.recurringTransaction.findFirst({
      where: { id, userId },
    });

    if (!rt) {
      throw new Error('Recurring transaction not found');
    }

    return this.prisma.recurringTransaction.delete({
      where: { id },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.debug('Running recurring transactions scheduler...');
    const now = new Date();

    // 1. Process Active Transactions
    const recurringTransactions =
      await this.prisma.recurringTransaction.findMany({
        where: {
          status: RecurringStatus.ACTIVE,
          nextRunDate: {
            lte: now,
          },
        },
      });

    for (const rt of recurringTransactions) {
      // Check if expired
      if (rt.endDate && rt.endDate < now) {
        await this.prisma.recurringTransaction.update({
          where: { id: rt.id },
          data: { status: RecurringStatus.INACTIVE },
        });
        continue;
      }

      try {
        await this.prisma.$transaction(async (tx) => {
          // 1. Create Transaction
          await tx.transaction.create({
            data: {
              userId: rt.userId,
              transactionType: rt.transactionType,
              amount: rt.amount,
              description: rt.description,
              categoryId: rt.categoryId,
              sourceAccountid: rt.sourceAccountId,
              destinationAccountId: rt.destinationAccountId,
              transactionDate: new Date(), // Now
              recurringTransactionId: rt.id,
            },
          });

          // 2. Update Balances (using a helper that works within transaction context would be best, but for now I'll do it manually on `tx`)
          // Logic repeated from create... ideally refactor.

          const amountNum = Number(rt.amount);
          if (
            rt.transactionType === TransactionType.EXPENSE &&
            rt.sourceAccountId
          ) {
            await tx.account.update({
              where: { id: rt.sourceAccountId },
              data: { currentBalance: { decrement: amountNum } },
            });
          } else if (rt.transactionType === TransactionType.INCOME) {
            // Assuming Income goes to sourceAccount if set (or destination?)
            // Based on CreateDto, source is optional for Income.
            // If sourceAccountId is present, use it.
            const targetAccountId =
              rt.sourceAccountId || rt.destinationAccountId;
            if (targetAccountId) {
              await tx.account.update({
                where: { id: targetAccountId },
                data: { currentBalance: { increment: amountNum } },
              });
            }
          } else if (
            rt.transactionType === TransactionType.TRANSFER &&
            rt.sourceAccountId &&
            rt.destinationAccountId
          ) {
            await tx.account.update({
              where: { id: rt.sourceAccountId },
              data: { currentBalance: { decrement: amountNum } },
            });
            await tx.account.update({
              where: { id: rt.destinationAccountId },
              data: { currentBalance: { increment: amountNum } },
            });
          }

          // 3. Update RecurringTransaction next run date
          const nextDate = this.calculateNextRunDate(
            rt.nextRunDate,
            rt.interval,
          );
          await tx.recurringTransaction.update({
            where: { id: rt.id },
            data: {
              lastRunDate: new Date(),
              nextRunDate: nextDate,
            },
          });
        });
      } catch (e) {
        this.logger.error(
          `Failed to process recurring transaction ${rt.id}: ${e.message}`,
        );
      }
    }
  }

  private calculateNextRunDate(
    currentDate: Date,
    interval: RecurringInterval,
  ): Date {
    const nextDate = new Date(currentDate);
    switch (interval) {
      case RecurringInterval.DAILY:
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case RecurringInterval.WEEKLY:
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case RecurringInterval.MONTHLY:
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case RecurringInterval.YEARLY:
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
    }
    return nextDate;
  }

  private async handleBalanceUpdate(
    userId: string,
    type: TransactionType,
    amount: string | number,
    sourceId?: string,
    destId?: string,
  ) {
    const amountNum = Number(amount);
    if (type === TransactionType.EXPENSE && sourceId) {
      await this.prisma.account.update({
        where: { id: sourceId },
        data: { currentBalance: { decrement: amountNum } },
      });
    } else if (type === TransactionType.INCOME) {
      const targetId = sourceId || destId; // Fallback
      if (targetId) {
        await this.prisma.account.update({
          where: { id: targetId },
          data: { currentBalance: { increment: amountNum } },
        });
      }
    } else if (type === TransactionType.TRANSFER && sourceId && destId) {
      await this.prisma.account.update({
        where: { id: sourceId },
        data: { currentBalance: { decrement: amountNum } },
      });
      await this.prisma.account.update({
        where: { id: destId },
        data: { currentBalance: { increment: amountNum } },
      });
    }
  }
}
