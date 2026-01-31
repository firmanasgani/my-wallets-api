import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { AccountType, LogActionType, Prisma } from '@prisma/client';
import { UpdateAccountDto } from './dto/update-account.dto';
import { LogsService } from 'src/logs/logs.service';
import { use } from 'passport';

@Injectable()
export class AccountsService {
  constructor(
    private prisma: PrismaService,
    private logsService: LogsService,
  ) {}

  async create(
    userId: string,
    createAccountDto: CreateAccountDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const {
      accountType,
      bankId,
      initialBalance = 0,
      currency = 'IDR',
      ...restData
    } = createAccountDto;
    let resolvedBankId: string | null = null;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    if (user.subscriptionPlan === 'FREE') {
      const accountCount = await this.prisma.account.count({
        where: { userId },
      });
      if (accountCount >= 4) {
        throw new ForbiddenException(
          'Free plan users are limited to 4 accounts. Please upgrade to create more.',
        );
      }
    }

    if (accountType == AccountType.BANK) {
      if (!bankId)
        throw new BadRequestException(
          'Bank ID is required for bank account type',
        );
      const bankExists = await this.prisma.bank.findUnique({
        where: {
          id: bankId,
        },
      });
      if (!bankExists) throw new BadRequestException('Bank ID is invalid');
      resolvedBankId = bankId;
    } else if (bankId) {
      throw new BadRequestException(
        'Bank ID is not required for non bank account type',
      );
    }

    const account = await this.prisma.account.create({
      data: {
        userId,
        accountType,
        bankId: resolvedBankId,
        initialBalance,
        currentBalance: initialBalance,
        currency,
        ...restData,
      },
      include: {
        bank: true,
      },
    });

    try {
      await this.logsService.create({
        userId,
        entityType: 'account',
        entityId: account.id,
        actionType: LogActionType.ACCOUNT_CREATE,
        details: {
          accountId: account.id,
          ...createAccountDto,
        },
        description: `Created ${account.accountName} account`,
        ipAddress: ipAddress ?? '',
        userAgent: userAgent ?? '',
      });
    } catch (error) {
      Logger.error(`Failed to create log entry: ${error.message}`);
    }

    return account;
  }

  async findAll(userId: string) {
    return this.prisma.account.findMany({
      where: {
        userId,
      },
      include: {
        bank: true,
      },
      orderBy: { accountName: 'asc' },
    });
  }

  async findOne(userId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: {
        id: accountId,
        userId,
      },
      include: {
        bank: true,
      },
    });

    if (!account) throw new BadRequestException('Account not found');
    return account;
  }

  async update(
    userId: string,
    accountId: string,
    updateAccountDto: UpdateAccountDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const existingAccount = await this.findOne(userId, accountId);
    const { accountType, bankId, ...restData } = updateAccountDto;

    let resolveBankId: string | null = null;
    if (accountType !== undefined) {
      if (accountType === AccountType.BANK) {
        if (!bankId) {
          throw new BadRequestException(
            'Bank ID is required for bank account type',
          );
        }

        const bankExists = await this.prisma.bank.findUnique({
          where: {
            id: bankId,
          },
        });

        if (!bankExists) {
          throw new BadRequestException('Bank ID is invalid');
        }
        resolveBankId = bankId;
      } else {
        resolveBankId = null;
        if (bankId) {
          throw new BadRequestException(
            'Bank ID is not required for non bank account type',
          );
        }
      }
    } else if (
      bankId !== undefined &&
      existingAccount.accountType === AccountType.BANK
    ) {
      const bankExists = await this.prisma.bank.findUnique({
        where: {
          id: bankId,
        },
      });

      if (!bankExists) {
        throw new BadRequestException('Bank ID is invalid');
      }
      resolveBankId = bankId;
    } else if (
      bankId !== undefined &&
      existingAccount.accountType !== AccountType.BANK
    ) {
      throw new BadRequestException(
        'Bank ID is not required for non bank account type',
      );
    }

    const dataToUpdate: Prisma.AccountUpdateInput = {
      ...restData,
      ...(accountType !== undefined && { accountType }),
      ...(resolveBankId !== null && {
        bank: { connect: { id: resolveBankId } },
      }),
    };

    const updatedAccount = await this.prisma.account.update({
      where: {
        id: accountId,
      },
      data: dataToUpdate,
      include: { bank: true },
    });

    try {
      await this.logsService.create({
        userId,
        entityType: 'account',
        entityId: accountId,
        actionType: LogActionType.ACCOUNT_UPDATE,
        details: {
          accountId,
          ...updateAccountDto,
        },
        description: `Updated ${existingAccount.accountName} account`,
        ipAddress: ipAddress ?? '',
        userAgent: userAgent ?? '',
      });
    } catch (error) {
      Logger.log(`Failed to create log entry: ${error.message}`);
    }
    return updatedAccount;
  }

  async remove(
    userId: string,
    accountId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const account = await this.findOne(userId, accountId);

    const relatedTransactionsCount = await this.prisma.transaction.count({
      where: {
        OR: [
          { sourceAccountid: accountId },
          { destinationAccountId: accountId },
        ],
      },
    });

    if (relatedTransactionsCount > 0) {
      throw new BadRequestException('Account has related transactions');
    }

    const deletedAccount = await this.prisma.account.delete({
      where: {
        id: accountId,
      },
    });

    try {
      await this.logsService.create({
        userId,
        actionType: LogActionType.ACCOUNT_DELETE,
        entityType: 'account',
        entityId: accountId,
        description: `Deleted ${account.accountName} account`,
        ipAddress: ipAddress ?? '',
        userAgent: userAgent ?? '',
        details: {
          accountId: account.id,
          deletedAccountName: account.accountName,
        },
      });
    } catch (error) {
      Logger.log(`Failed to create log entry: ${error.message}`);
    }
    return {
      message: `Account ${account.accountName} has been deleted`,
    };
  }
}
