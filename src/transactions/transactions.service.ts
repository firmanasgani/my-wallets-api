import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LogsService } from 'src/logs/logs.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateIncomeDto } from './dto/create-income.dto';
import {
  CategoryType,
  LogActionType,
  Prisma,
  TransactionType,
} from '@prisma/client';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private logsService: LogsService,
  ) {}

  async createIncome(
    userId: string,
    dto: CreateIncomeDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const {
      destinationAccountId,
      categoryId,
      amount,
      transactionDate,
      description,
    } = dto;

    const destinationAccount = await this.prisma.account.findFirst({
      where: { id: destinationAccountId, userId },
    });

    if (!destinationAccount)
      throw new ForbiddenException(
        'Destination account not found or access Denied',
      );

    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
    });

    if (!category)
      throw new ForbiddenException('Category not found or access Denied');

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const transaction = await tx.transaction.create({
          data: {
            amount,
            transactionDate: transactionDate
              ? new Date(transactionDate)
              : new Date(),
            transactionType: TransactionType.INCOME,
            description,
            destinationAccountId,
            sourceAccountid: null,
            categoryId,
            userId,
          },
          include: {
            category: true,
            destinationAccount: {
              include: { bank: true },
            },
          },
        });

        await tx.account.update({
          where: { id: destinationAccountId },
          data: {
            currentBalance: { increment: amount },
          },
        });
        return transaction;
      });

      await this.logsService.create({
        userId,
        actionType: LogActionType.TRANSACTION_CREATE_INCOME,
        entityType: 'TRANSACTION',
        entityId: result.id,
        ipAddress,
        details: {
          amount: result.amount.toString(),
          transactionDate: result.transactionDate.toISOString(),
          transactionType: result.transactionType,
          description: result.description,
          destinationAccountId: result.destinationAccountId,
          categoryId: result.categoryId,
        },
        userAgent,
        description: `User created income transaction ${result.id} to ${result.destinationAccount?.accountName} for ${result.amount}`,
      });
    } catch (error) {
      Logger.error(error);
      throw new InternalServerErrorException(
        'Failed to create income transaction',
      );
    }
  }

  async createExpense(
    userId: string,
    dto: CreateExpenseDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const {
      sourceAccountId,
      categoryId,
      amount,
      transactionDate,
      description,
    } = dto;

    const sourceAccount = await this.prisma.account.findFirst({
      where: { id: sourceAccountId, userId },
    });

    if (!sourceAccount)
      throw new ForbiddenException('Source account not found or access Denied');

    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
    });

    if (!category)
      throw new ForbiddenException('Category not found or access Denied');

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const transaction = await tx.transaction.create({
          data: {
            amount,
            transactionDate: transactionDate
              ? new Date(transactionDate)
              : new Date(),
            transactionType: TransactionType.EXPENSE,
            description,
            destinationAccountId: null,
            sourceAccountid: sourceAccountId,
            categoryId,
            userId,
          },
          include: {
            category: true,
            sourceAccount: {
              include: { bank: true },
            },
          },
        });

        await tx.account.update({
          where: { id: sourceAccountId },
          data: {
            currentBalance: { decrement: amount },
          },
        });
        return transaction;
      });

      await this.logsService.create({
        userId,
        actionType: LogActionType.TRANSACTION_CREATE_EXPENSE,
        entityType: 'TRANSACTION',
        entityId: result.id,
        ipAddress,
        details: {
          amount: result.amount.toString(),
          transactionDate: result.transactionDate.toISOString(),
          transactionType: result.transactionType,
          description: result.description,
          sourceAccountId: result.sourceAccountid,
          categoryId: result.categoryId,
        },
        userAgent,
        description: `User created expense transaction ${result.id} from ${result.sourceAccount?.accountName} for ${result.amount}`,
      });
    } catch (error) {
      Logger.error(error);
      throw new InternalServerErrorException(
        'Failed to create expense transaction',
      );
    }
  }

  async createTransfer(
    userId: string,
    dto: CreateTransferDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const {
      sourceAccountId,
      destinationAccountId,
      amount,
      transactionDate,
      description,
    } = dto;

    const sourceAccount = await this.prisma.account.findFirst({
      where: { id: sourceAccountId, userId },
    });

    if (!sourceAccount)
      throw new ForbiddenException('Source account not found or access Denied');

    const destinationAccount = await this.prisma.account.findFirst({
      where: { id: destinationAccountId, userId },
    });

    if (!destinationAccount)
      throw new ForbiddenException(
        'Destination account not found or access Denied',
      );

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const transaction = await tx.transaction.create({
          data: {
            amount,
            transactionDate: transactionDate
              ? new Date(transactionDate)
              : new Date(),
            transactionType: TransactionType.TRANSFER,
            description,
            destinationAccountId,
            sourceAccountid: sourceAccountId,
            categoryId: null,
            userId,
          },
          include: {
            destinationAccount: {
              include: { bank: true },
            },
            sourceAccount: {
              include: { bank: true },
            },
          },
        });

        await tx.account.update({
          where: { id: sourceAccountId },
          data: {
            currentBalance: { decrement: amount },
          },
        });

        await tx.account.update({
          where: { id: destinationAccountId },
          data: {
            currentBalance: { increment: amount },
          },
        });
        return transaction;
      });

      await this.logsService.create({
        userId,
        actionType: LogActionType.TRANSACTION_CREATE_TRANSFER,
        entityType: 'TRANSACTION',
        entityId: result.id,
        ipAddress,
        details: {
          amount: result.amount.toString(),
          transactionDate: result.transactionDate.toISOString(),
          transactionType: result.transactionType,
          description: result.description,
          sourceAccountId: result.sourceAccountid,
          destinationAccountId: result.destinationAccountId,
        },
        userAgent,
        description: `User created transfer transaction ${result.id} from ${result.sourceAccount?.accountName} to ${result.destinationAccount?.accountName} for ${result.amount}`,
      });
    } catch (error) {
      Logger.error(error);
      throw new InternalServerErrorException(
        'Failed to create transfer transaction',
      );
    }
  }

  async findAll(userId: string, query: QueryTransactionDto) {
    const {
      accountId,
      type,
      categoryId,
      startDate,
      endDate,
      page = 1,
      limit = 10,
      sortBy = 'transactionDate',
      sortOrder = 'desc',
      search,
    } = query;

    const whereClause: Prisma.TransactionWhereInput = {
      userId,
      ...(type ? { transactionType: type } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(startDate ? { transactionDate: { gte: new Date(startDate) } } : {}),
      ...(endDate ? { transactionDate: { lte: new Date(endDate) } } : {}),
      ...(search
        ? { description: { contains: search, mode: 'insensitive' } as any }
        : {}),
      ...(accountId
        ? {
            OR: [
              { sourceAccountid: accountId },
              { destinationAccountId: accountId },
            ],
          }
        : {}),
    };

    const transactions = await this.prisma.transaction.findMany({
      where: whereClause,
      include: {
        category: true,
        sourceAccount: {
          select: {
            id: true,
            accountName: true,
            accountType: true,
            bank: { select: { name: true } },
          },
        },
        destinationAccount: {
          select: {
            id: true,
            accountName: true,
            accountType: true,
            bank: { select: { name: true } },
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await this.prisma.transaction.count({ where: whereClause });

    return {
      data: transactions,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(userId: string, transactionId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        id: transactionId,
        userId,
      },
      include: {
        category: true,
        sourceAccount: {
          select: {
            id: true,
            accountName: true,
            accountType: true,
            bank: {
              select: {
                name: true,
              },
            },
          },
        },
        destinationAccount: {
          select: {
            id: true,
            accountName: true,
            accountType: true,
            bank: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!transaction)
      throw new ForbiddenException('Transaction not found or access Denied');
    return transaction;
  }

  async remove(
    userId: string,
    transactionId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // 1. Ambil transaksi yang akan dihapus untuk validasi dan mendapatkan detailnya
    const transactionToDelete = await this.prisma.transaction.findFirst({
      where: {
        id: transactionId,
        userId: userId, // Validasi kepemilikan
      },
    });

    if (!transactionToDelete) {
      throw new NotFoundException(
        `Transaction with ID ${transactionId} not found or you do not have permission to delete it.`,
      );
    }

    // Simpan detail penting sebelum dihapus (untuk logging dan referensi)
    const {
      amount,
      transactionType,
      sourceAccountid,
      destinationAccountId,
      description,
      categoryId,
    } = transactionToDelete;

    // 2. Gunakan Prisma Transaction untuk memastikan atomicity
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // a. Kembalikan saldo akun berdasarkan tipe transaksi
        if (transactionType === TransactionType.INCOME) {
          if (destinationAccountId) {
            await tx.account.update({
              where: { id: destinationAccountId },
              data: { currentBalance: { decrement: amount } }, // Kurangi saldo karena income dihapus
            });
          } else {
            // Seharusnya tidak terjadi jika data konsisten
            console.warn(
              `INCOME transaction ${transactionId} is missing destinationAccountId. Balance not adjusted.`,
            );
          }
        } else if (transactionType === TransactionType.EXPENSE) {
          if (sourceAccountid) {
            await tx.account.update({
              where: { id: sourceAccountid },
              data: { currentBalance: { increment: amount } }, // Tambah saldo karena expense dihapus
            });
          } else {
            console.warn(
              `EXPENSE transaction ${transactionId} is missing sourceAccountId. Balance not adjusted.`,
            );
          }
        } else if (transactionType === TransactionType.TRANSFER) {
          if (sourceAccountid && destinationAccountId) {
            // Kembalikan dana ke akun sumber
            await tx.account.update({
              where: { id: sourceAccountid },
              data: { currentBalance: { increment: amount } },
            });
            // Ambil dana dari akun tujuan
            await tx.account.update({
              where: { id: destinationAccountId },
              data: { currentBalance: { decrement: amount } },
            });
          } else {
            console.warn(
              `TRANSFER transaction ${transactionId} is missing source or destination accountId. Balances not fully adjusted.`,
            );
          }
        }

        // b. Hapus record transaksi
        await tx.transaction.delete({
          where: { id: transactionId },
        });

        // Anda bisa mengembalikan detail transaksi yang dihapus jika perlu
        return {
          id: transactionId,
          message: `Transaction '${description || transactionId}' deleted successfully and balances adjusted.`,
        };
      });

      // Logging setelah transaksi database berhasil
      await this.logsService.create({
        userId,
        actionType: LogActionType.TRANSACTION_DELETE, // Pastikan enum ini ada
        entityType: 'Transaction',
        entityId: transactionId,
        description: `User deleted transaction (ID: ${transactionId}, Type: ${transactionType}, Amount: ${amount}).`,
        details: {
          deletedTransactionId: transactionId,
          type: transactionType,
          amount: amount.toString(), // Prisma JsonValue lebih suka string untuk Decimal
          sourceAccountid,
          destinationAccountId,
          categoryId,
          description,
        },
        ipAddress,
        userAgent,
      });

      return result; // Kembalikan hasil dari blok $transaction
    } catch (error) {
      console.error(`Error deleting transaction ${transactionId}:`, error);
      // Periksa apakah error berasal dari Prisma, misal akun tidak ditemukan saat update (seharusnya tidak terjadi jika findFirst di awal berhasil)
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Error spesifik Prisma (misalnya, record to update not found - P2025)
        throw new InternalServerErrorException(
          `Database error while deleting transaction: ${error.message}`,
        );
      }
      throw new InternalServerErrorException(
        'Failed to delete transaction and adjust balances.',
      );
    }
  }

  async update(
    userId: string,
    transactionId: string,
    updateTransactionDto: UpdateTransactionDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // 1. Ambil transaksi yang ada untuk validasi kepemilikan dan data lama
    const existingTransaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId },
      // Tidak perlu include relasi jika hanya update field dasar,
      // tapi bisa berguna untuk validasi kategori atau logging.
      include: { category: true },
    });

    if (!existingTransaction) {
      throw new NotFoundException(
        `Transaction with ID ${transactionId} not found or you do not have permission to update it.`,
      );
    }

    // Simpan nilai lama untuk logging
    const oldValues = {
      description: existingTransaction.description,
      transactionDate: existingTransaction.transactionDate
        .toISOString()
        .split('T')[0], // Format YYYY-MM-DD
      categoryId: existingTransaction.categoryId,
      categoryName: existingTransaction.category?.categoryName, // Ambil nama kategori jika ada
      // amount: existingTransaction.amount.toNumber(), // Jika kita mengizinkan update amount
    };

    const { amount, categoryId, transactionDate, description } =
      updateTransactionDto;

    // **PENTING: Batasan untuk versi awal**
    if (
      amount !== undefined &&
      amount !== existingTransaction.amount.toNumber()
    ) {
      // Prisma mengembalikan Decimal, jadi konversi ke number untuk perbandingan jika perlu
      throw new BadRequestException(
        'Updating the transaction amount is not supported in this version. Please delete and recreate the transaction if amount needs to be changed.',
      );
    }
    // Perubahan tipe transaksi, source/destination account juga tidak didukung untuk saat ini.

    const dataToUpdate: Prisma.TransactionUpdateInput = {};

    if (description !== undefined) {
      dataToUpdate.description = description;
    }

    if (transactionDate !== undefined) {
      dataToUpdate.transactionDate = new Date(transactionDate);
    }

    if (categoryId !== undefined) {
      if (categoryId === null) {
        // Jika user ingin menghapus kategori dari transaksi
        if (existingTransaction.transactionType === TransactionType.TRANSFER) {
          dataToUpdate.category = { disconnect: true };
        } else {
          // Untuk INCOME/EXPENSE, kategori biasanya wajib.
          // Bisa pilih untuk melarang, atau membiarkan jika skema memperbolehkan categoryId null untuk semua tipe.
          // Asumsi kita: kategori wajib untuk INCOME/EXPENSE.
          throw new BadRequestException(
            'Category cannot be removed from Income or Expense transactions.',
          );
        }
      } else {
        // Validasi kategori baru
        const newCategory = await this.prisma.category.findFirst({
          where: {
            id: categoryId,
          },
        });
        if (!newCategory) {
          throw new BadRequestException(
            `New category with ID ${categoryId} not found or not accessible.`,
          );
        }
        // Validasi tipe kategori vs tipe transaksi
        if (
          existingTransaction.transactionType === TransactionType.INCOME &&
          newCategory.categoryType !== CategoryType.INCOME
        ) {
          throw new BadRequestException(
            `Category '${newCategory.categoryName}' is not an INCOME category.`,
          );
        }
        if (
          existingTransaction.transactionType === TransactionType.EXPENSE &&
          newCategory.categoryType !== CategoryType.EXPENSE
        ) {
          throw new BadRequestException(
            `Category '${newCategory.categoryName}' is not an EXPENSE category.`,
          );
        }
        // Untuk TRANSFER, categoryId biasanya null, jadi jika di-set, kita tidak terlalu membatasi tipenya.
        dataToUpdate.category = { connect: { id: categoryId } };
      }
    }

    // Jika tidak ada field yang diupdate, tidak perlu ke database
    if (Object.keys(dataToUpdate).length === 0) {
      return existingTransaction; // Kembalikan data yang ada jika tidak ada perubahan
    }

    const updatedTransaction = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: dataToUpdate,
      include: {
        category: true,
        sourceAccount: { select: { id: true, accountName: true } },
        destinationAccount: { select: { id: true, accountName: true } },
      },
    });

    // Logging
    await this.logsService.create({
      userId,
      actionType: LogActionType.TRANSACTION_UPDATE, // Pastikan enum ini ada
      entityType: 'Transaction',
      entityId: transactionId,
      description: `User updated transaction ID ${transactionId}.`,
      details: {
        transactionId,
        oldValues: {
          description: oldValues.description,
          transactionDate: oldValues.transactionDate.toString(),
          categoryId: oldValues.categoryId,
          categoryName: oldValues.categoryName,
        }, // Detail nilai lama
        newValues: {
          description: description,
          transactionDate: transactionDate?.toISOString().split('T')[0],
          categoryId,
          categoryName: existingTransaction.category?.categoryName,
        }, // Detail nilai baru yang di-request
      },
      ipAddress,
      userAgent,
    });

    return updatedTransaction;
  }
}
