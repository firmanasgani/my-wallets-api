import { ForbiddenException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { LogsService } from 'src/logs/logs.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateIncomeDto } from './dto/create-income.dto';
import { LogActionType, Prisma, TransactionType } from '@prisma/client';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';

@Injectable()
export class TransactionsService {
    constructor(
        private prisma: PrismaService,
        private logsService: LogsService
    ) {}

    async createIncome(
        userId: string, dto: CreateIncomeDto, ipAddress?: string, userAgent?: string
    ) {
        const { destinationAccountId, categoryId, amount, transactionDate, description } = dto;

        const destinationAccount = await this.prisma.account.findFirst({
            where: {id: destinationAccountId, userId}
        })

        if(!destinationAccount) throw new ForbiddenException('Destination account not found or access Denied')
        
        const category = await this.prisma.category.findFirst({
            where: {id: categoryId, userId}
        })

        if(!category) throw new ForbiddenException('Category not found or access Denied')

        try {
            const result = await this.prisma.$transaction(async (tx) => {
                const transaction = await tx.transaction.create({
                    data: {
                        amount,
                        transactionDate: transactionDate ? new Date(transactionDate) : new Date(),  
                        transactionType: TransactionType.INCOME,
                        description,
                        destinationAccountId,
                        sourceAccountid: null,
                        categoryId,
                        userId
                    }, include: {category: true, destinationAccount: {
                        include: { bank :true }
                    }}
                })

                await tx.account.update({
                    where: { id: destinationAccountId },
                    data: {
                        currentBalance: { increment: amount }
                    }
                })
                return transaction
            })

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
                        categoryId: result.categoryId
                    },
                    userAgent,
                    description: `User created income transaction ${result.id} to ${result.destinationAccount?.accountName} for ${result.amount}`
                });

        }catch(error) {
            Logger.error(error)
            throw new InternalServerErrorException('Failed to create income transaction')
        }
    }

    async createExpense(
        userId: string,
        dto: CreateExpenseDto,
        ipAddress?: string,
        userAgent?: string
    ) {

        const { sourceAccountId, categoryId, amount, transactionDate, description } = dto;

        const sourceAccount = await this.prisma.account.findFirst({
            where: {id: sourceAccountId, userId}
        })

        if(!sourceAccount) throw new ForbiddenException('Source account not found or access Denied')
        
        const category = await this.prisma.category.findFirst({
            where: {id: categoryId, userId}
        })

        if(!category) throw new ForbiddenException('Category not found or access Denied')

        try {
            const result = await this.prisma.$transaction(async (tx) => {
                const transaction = await tx.transaction.create({
                    data: {
                        amount,
                        transactionDate: transactionDate ? new Date(transactionDate) : new Date(),  
                        transactionType: TransactionType.EXPENSE,
                        description,
                        destinationAccountId: null,
                        sourceAccountid: sourceAccountId,
                        categoryId,
                        userId
                    }, include: {category: true, sourceAccount: {
                        include: { bank :true }
                    }}
                })

                await tx.account.update({
                    where: { id: sourceAccountId },
                    data: {
                        currentBalance: { decrement: amount }
                    }
                })
                return transaction
            })

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
                        categoryId: result.categoryId
                    },
                    userAgent,
                    description: `User created expense transaction ${result.id} from ${result.sourceAccount?.accountName} for ${result.amount}`
                });

        }catch(error) {
            Logger.error(error)
            throw new InternalServerErrorException('Failed to create expense transaction')
        }
    }


    async createTransfer(
        userId: string,
        dto: CreateTransferDto,
        ipAddress?: string,
        userAgent?: string
    ) {

        const { sourceAccountId, destinationAccountId, amount, transactionDate, description } = dto;

        const sourceAccount = await this.prisma.account.findFirst({
            where: {id: sourceAccountId, userId}
        })

        if(!sourceAccount) throw new ForbiddenException('Source account not found or access Denied')
        
        const destinationAccount = await this.prisma.account.findFirst({
            where: {id: destinationAccountId, userId}
        })

        if(!destinationAccount) throw new ForbiddenException('Destination account not found or access Denied')

        try {
            const result = await this.prisma.$transaction(async (tx) => {
                const transaction = await tx.transaction.create({
                    data: {
                        amount,
                        transactionDate: transactionDate ? new Date(transactionDate) : new Date(),  
                        transactionType: TransactionType.TRANSFER,
                        description,
                        destinationAccountId,
                        sourceAccountid: sourceAccountId,
                        categoryId: null,
                        userId
                    }, include: {destinationAccount: {
                        include: { bank :true }
                    }, sourceAccount: {
                        include: { bank :true }
                    }}
                })

                await tx.account.update({
                    where: { id: sourceAccountId },
                    data: {
                        currentBalance: { decrement: amount }
                    }
                })

                await tx.account.update({
                    where: { id: destinationAccountId },
                    data: {
                        currentBalance: { increment: amount }
                    }
                })
                return transaction
            })

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
                        destinationAccountId: result.destinationAccountId
                    },
                    userAgent,
                    description: `User created transfer transaction ${result.id} from ${result.sourceAccount?.accountName} to ${result.destinationAccount?.accountName} for ${result.amount}`
                });

        }catch(error) {
            Logger.error(error)
            throw new InternalServerErrorException('Failed to create transfer transaction')
        }
    }

    async findAll(
        userId: string,
        query: QueryTransactionDto
    ) {

        const { accountId, type, categoryId, startDate, endDate, page =1 , limit = 10, sortBy = 'transactionDate', sortOrder = 'desc' } = query;

        const whereClause: Prisma.TransactionWhereInput = {
            userId,
            ...(type ? { transactionType: type } : {}),
            ...(categoryId ? { categoryId } : {}),
            ...(startDate ? { transactionDate: { gte: new Date(startDate) } } : {}),
            ...(endDate ? { transactionDate: { lte: new Date(endDate) } } : {}),
            ...(accountId ? {
                OR: [
                    { sourceAccountid: accountId },
                    { destinationAccountId: accountId },
                ],
            } : {}),
        };

        const transactions = await this.prisma.transaction.findMany({
            where: whereClause,
            include: {
                category: true,
                sourceAccount: { select: { id: true, accountName: true, accountType: true, bank: {select: {name: true}} } },
                destinationAccount: { select: { id: true, accountName: true, accountType: true, bank: {select: {name: true}} } },
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
          

  
}
