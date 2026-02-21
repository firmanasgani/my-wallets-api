import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CategoryType,
  GoalLedgerDirection,
  GoalLedgerType,
  GoalStatus,
  SubscriptionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AllocateGoalDto } from './dto/allocate-goal.dto';
import { AdjustGoalDto } from './dto/adjust-goal.dto';
import { CreateFinancialGoalDto } from './dto/create-financial-goal.dto';
import { ReleaseGoalDto } from './dto/release-goal.dto';
import { SpendGoalDto } from './dto/spend-goal.dto';
import { UpdateFinancialGoalDto } from './dto/update-financial-goal.dto';

@Injectable()
export class FinancialGoalsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Validasi bahwa user memiliki paket premium aktif.
   * Financial Goals adalah fitur eksklusif premium — user FREE akan diblok di semua endpoint.
   */
  private async checkPremiumAccess(userId: string): Promise<void> {
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
    const isFreePlan = !activeSubscription || activeSubscription.plan.code === 'FREE';

    if (isFreePlan) {
      throw new ForbiddenException(
        'Financial Goals is a premium feature. Please upgrade your plan to access this feature.',
      );
    }
  }

  // Hitung total saved dari sebuah goal berdasarkan ledger entries-nya
  private calcSaved(ledgers: { direction: GoalLedgerDirection; amount: any }[]): number {
    return ledgers.reduce((total, l) => {
      const amt = Number(l.amount);
      return l.direction === GoalLedgerDirection.INCOMING ? total + amt : total - amt;
    }, 0);
  }

  /**
   * Hitung berapa total uang dari akun TERTENTU yang sudah dialokasikan
   * ke goal TERTENTU (net setelah release/spend dari akun tersebut).
   * Digunakan untuk validasi RELEASE: tidak boleh release lebih dari yang dialokasikan.
   */
  private async computeGoalAllocatedFromAccount(
    goalId: string,
    accountId: string,
    tx?: any,
  ): Promise<number> {
    const client = tx || this.prisma;

    const incoming = await client.goalLedger.aggregate({
      where: {
        goalId,
        accountId,
        direction: GoalLedgerDirection.INCOMING,
        type: GoalLedgerType.ALLOCATE,
      },
      _sum: { amount: true },
    });

    const outgoing = await client.goalLedger.aggregate({
      where: {
        goalId,
        accountId,
        direction: GoalLedgerDirection.OUTGOING,
        type: { in: [GoalLedgerType.RELEASE, GoalLedgerType.SPEND] },
      },
      _sum: { amount: true },
    });

    return Number(incoming._sum.amount ?? 0) - Number(outgoing._sum.amount ?? 0);
  }

  /**
   * Hitung total uang dari akun yang sudah dialokasikan ke SEMUA goal (net).
   * Digunakan untuk validasi ALLOCATE: availableBalance = currentBalance - totalAllocated.
   * Ini mencegah user mengalokasikan uang yang sama ke lebih dari satu goal.
   */
  private async computeAccountTotalAllocated(accountId: string, tx?: any): Promise<number> {
    const client = tx || this.prisma;

    const incoming = await client.goalLedger.aggregate({
      where: { accountId, direction: GoalLedgerDirection.INCOMING },
      _sum: { amount: true },
    });

    const outgoing = await client.goalLedger.aggregate({
      where: { accountId, direction: GoalLedgerDirection.OUTGOING },
      _sum: { amount: true },
    });

    return Number(incoming._sum.amount ?? 0) - Number(outgoing._sum.amount ?? 0);
  }

  private buildGoalSummary(goal: any) {
    const currentSaved = Math.max(this.calcSaved(goal.ledgers ?? []), 0);
    const targetAmount = Number(goal.targetAmount);
    return {
      ...goal,
      ledgers: undefined,
      currentSaved,
      progressPercentage:
        targetAmount > 0 ? Math.min((currentSaved / targetAmount) * 100, 100) : 0,
      remainingAmount: Math.max(targetAmount - currentSaved, 0),
    };
  }

  async createGoal(userId: string, dto: CreateFinancialGoalDto) {
    await this.checkPremiumAccess(userId);
    return this.prisma.financialGoal.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        targetAmount: dto.targetAmount,
        targetDate: dto.targetDate ? new Date(String(dto.targetDate)) : undefined,
      },
    });
  }

  async findAll(userId: string) {
    await this.checkPremiumAccess(userId);
    const goals = await this.prisma.financialGoal.findMany({
      where: { userId },
      include: {
        ledgers: { select: { direction: true, amount: true } },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });

    return goals.map((goal) => this.buildGoalSummary(goal));
  }

  async findOne(userId: string, goalId: string) {
    await this.checkPremiumAccess(userId);
    const goal = await this.prisma.financialGoal.findFirst({
      where: { id: goalId, userId },
      include: {
        ledgers: {
          include: {
            account: { select: { id: true, accountName: true, accountType: true } },
            referenceTransaction: {
              select: {
                id: true,
                transactionType: true,
                amount: true,
                transactionDate: true,
                description: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!goal) throw new NotFoundException('Goal not found');

    const currentSaved = Math.max(this.calcSaved(goal.ledgers), 0);
    const targetAmount = Number(goal.targetAmount);

    return {
      ...goal,
      currentSaved,
      progressPercentage:
        targetAmount > 0 ? Math.min((currentSaved / targetAmount) * 100, 100) : 0,
      remainingAmount: Math.max(targetAmount - currentSaved, 0),
    };
  }

  async updateGoal(userId: string, goalId: string, dto: UpdateFinancialGoalDto) {
    await this.checkPremiumAccess(userId);
    const goal = await this.prisma.financialGoal.findFirst({ where: { id: goalId, userId } });
    if (!goal) throw new NotFoundException('Goal not found');

    // Jika ingin cancel goal yang masih ada saldo, wajib release dulu
    if (dto.status === GoalStatus.CANCELLED && goal.status !== GoalStatus.CANCELLED) {
      const ledgers = await this.prisma.goalLedger.findMany({
        where: { goalId },
        select: { direction: true, amount: true },
      });
      const currentSaved = this.calcSaved(ledgers);
      if (currentSaved > 0) {
        throw new BadRequestException(
          `Cannot cancel goal with remaining savings of ${currentSaved}. Please release allocations first.`,
        );
      }
    }

    return this.prisma.financialGoal.update({
      where: { id: goalId },
      data: {
        name: dto.name,
        description: dto.description,
        targetAmount: dto.targetAmount,
        targetDate: dto.targetDate ? new Date(String(dto.targetDate)) : undefined,
        status: dto.status,
        priority: dto.priority,
      },
    });
  }

  async removeGoal(userId: string, goalId: string) {
    await this.checkPremiumAccess(userId);
    const goal = await this.prisma.financialGoal.findFirst({ where: { id: goalId, userId } });
    if (!goal) throw new NotFoundException('Goal not found');

    const ledgers = await this.prisma.goalLedger.findMany({
      where: { goalId },
      select: { direction: true, amount: true },
    });
    const currentSaved = this.calcSaved(ledgers);
    if (currentSaved > 0) {
      throw new BadRequestException(
        `Cannot delete goal with remaining savings of ${currentSaved}. Please release all allocations first.`,
      );
    }

    await this.prisma.financialGoal.delete({ where: { id: goalId } });
    return { message: 'Goal deleted successfully' };
  }

  /**
   * ALLOCATE: Tandai uang dari akun sebagai "sudah disisihkan" untuk goal.
   * Saldo akun (currentBalance) TIDAK berubah — ini soft allocation.
   * availableBalance = currentBalance - totalAllocated akan berkurang.
   *
   * Validasi: availableBalance dari akun harus >= amount yang ingin dialokasikan.
   * Ini mencegah saldo "double-counted" antara beberapa goal atau antara goal dan pengeluaran.
   */
  async allocate(userId: string, goalId: string, dto: AllocateGoalDto) {
    await this.checkPremiumAccess(userId);
    const amountNum = parseFloat(dto.amount);
    if (amountNum <= 0) throw new BadRequestException('Amount must be positive');

    const goal = await this.prisma.financialGoal.findFirst({
      where: { id: goalId, userId, status: GoalStatus.ACTIVE },
    });
    if (!goal) throw new NotFoundException('Goal not found or not active');

    const account = await this.prisma.account.findFirst({ where: { id: dto.accountId, userId } });
    if (!account) throw new ForbiddenException('Account not found or access denied');

    // availableBalance = currentBalance - semua yang sudah dialokasikan ke goal manapun dari akun ini
    const totalAllocated = await this.computeAccountTotalAllocated(dto.accountId);
    const availableBalance = Number(account.currentBalance) - totalAllocated;

    if (availableBalance < amountNum) {
      throw new BadRequestException(
        `Insufficient available balance. ` +
          `Account balance: ${Number(account.currentBalance).toFixed(2)}, ` +
          `already allocated to goals: ${totalAllocated.toFixed(2)}, ` +
          `available: ${availableBalance.toFixed(2)}, ` +
          `requested: ${amountNum}.`,
      );
    }

    return this.prisma.goalLedger.create({
      data: {
        goalId,
        accountId: dto.accountId,
        amount: amountNum,
        direction: GoalLedgerDirection.INCOMING,
        type: GoalLedgerType.ALLOCATE,
        note: dto.note,
      },
      include: {
        account: { select: { id: true, accountName: true, accountType: true } },
      },
    });
  }

  /**
   * SPEND: Gunakan uang dari goal untuk pengeluaran nyata.
   * Membuat expense Transaction + GoalLedger OUTGOING+SPEND.
   *
   * Validasi:
   * 1. goal.currentSaved >= amount (goal punya cukup tabungan)
   * 2. account.currentBalance >= amount (saldo fisik akun cukup)
   *
   * Setelah spend: currentBalance akun berkurang (karena ada expense nyata),
   * dan goal.currentSaved berkurang. availableBalance akun tidak berubah
   * karena currentBalance dan alokasi keduanya berkurang bersamaan.
   */
  async spend(userId: string, goalId: string, dto: SpendGoalDto) {
    await this.checkPremiumAccess(userId);
    const amountNum = parseFloat(dto.amount);
    if (amountNum <= 0) throw new BadRequestException('Amount must be positive');

    const goal = await this.prisma.financialGoal.findFirst({
      where: { id: goalId, userId },
      include: { ledgers: { select: { direction: true, amount: true } } },
    });
    if (!goal) throw new NotFoundException('Goal not found');

    const currentSaved = this.calcSaved(goal.ledgers);
    if (currentSaved < amountNum) {
      throw new BadRequestException(
        `Insufficient goal savings. Current saved: ${currentSaved.toFixed(2)}, requested: ${amountNum}.`,
      );
    }

    const account = await this.prisma.account.findFirst({ where: { id: dto.accountId, userId } });
    if (!account) throw new ForbiddenException('Account not found or access denied');

    if (Number(account.currentBalance) < amountNum) {
      throw new BadRequestException(
        `Insufficient account balance. ` +
          `Current balance: ${Number(account.currentBalance).toFixed(2)}, requested: ${amountNum}.`,
      );
    }

    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, userId, categoryType: CategoryType.EXPENSE },
    });
    if (!category) throw new ForbiddenException('Expense category not found or access denied');

    return this.prisma.$transaction(async (tx) => {
      // Kurangi saldo akun (pengeluaran nyata)
      await tx.account.update({
        where: { id: dto.accountId },
        data: { currentBalance: { decrement: amountNum } },
      });

      // Buat expense transaction agar tercatat di riwayat transaksi
      const transaction = await tx.transaction.create({
        data: {
          userId,
          transactionType: TransactionType.EXPENSE,
          amount: amountNum,
          transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : new Date(),
          description: dto.note ?? `Goal spend: ${goal.name}`,
          sourceAccountid: dto.accountId,
          categoryId: dto.categoryId,
        },
        include: {
          category: true,
          sourceAccount: { select: { id: true, accountName: true } },
        },
      });

      // Catat di GoalLedger sebagai OUTGOING
      const ledger = await tx.goalLedger.create({
        data: {
          goalId,
          accountId: dto.accountId,
          referenceTransactionId: transaction.id,
          amount: amountNum,
          direction: GoalLedgerDirection.OUTGOING,
          type: GoalLedgerType.SPEND,
          note: dto.note,
        },
      });

      // Auto-complete goal jika target tercapai
      const newSaved = currentSaved - amountNum;
      const targetAmount = Number(goal.targetAmount);
      if (newSaved >= targetAmount && goal.status === GoalStatus.ACTIVE) {
        await tx.financialGoal.update({
          where: { id: goalId },
          data: { status: GoalStatus.COMPLETED },
        });
      }

      return { transaction, ledger };
    });
  }

  /**
   * RELEASE: Lepas alokasi dari goal, uang kembali jadi "available" di akun.
   * Saldo fisik akun (currentBalance) TIDAK berubah — ini kebalikan soft allocation.
   * availableBalance akun akan bertambah kembali.
   *
   * Validasi: jumlah yang ingin di-release tidak boleh melebihi
   * total yang pernah dialokasikan dari akun ini ke goal ini.
   */
  async release(userId: string, goalId: string, dto: ReleaseGoalDto) {
    await this.checkPremiumAccess(userId);
    const amountNum = parseFloat(dto.amount);
    if (amountNum <= 0) throw new BadRequestException('Amount must be positive');

    const goal = await this.prisma.financialGoal.findFirst({ where: { id: goalId, userId } });
    if (!goal) throw new NotFoundException('Goal not found');

    const account = await this.prisma.account.findFirst({ where: { id: dto.accountId, userId } });
    if (!account) throw new ForbiddenException('Account not found or access denied');

    const allocatedFromAccountToGoal = await this.computeGoalAllocatedFromAccount(
      goalId,
      dto.accountId,
    );
    if (allocatedFromAccountToGoal < amountNum) {
      throw new BadRequestException(
        `Cannot release ${amountNum}. Only ${allocatedFromAccountToGoal.toFixed(2)} is net-allocated from this account to this goal.`,
      );
    }

    return this.prisma.goalLedger.create({
      data: {
        goalId,
        accountId: dto.accountId,
        amount: amountNum,
        direction: GoalLedgerDirection.OUTGOING,
        type: GoalLedgerType.RELEASE,
        note: dto.note,
      },
      include: {
        account: { select: { id: true, accountName: true, accountType: true } },
      },
    });
  }

  /**
   * ADJUST: Penyesuaian manual saldo goal (misal koreksi kesalahan input).
   * Untuk OUTGOING: validasi bahwa alokasi dari akun ini ke goal ini mencukupi.
   */
  async adjust(userId: string, goalId: string, dto: AdjustGoalDto) {
    await this.checkPremiumAccess(userId);
    const amountNum = parseFloat(dto.amount);
    if (amountNum <= 0) throw new BadRequestException('Amount must be positive');

    const goal = await this.prisma.financialGoal.findFirst({ where: { id: goalId, userId } });
    if (!goal) throw new NotFoundException('Goal not found');

    const account = await this.prisma.account.findFirst({ where: { id: dto.accountId, userId } });
    if (!account) throw new ForbiddenException('Account not found or access denied');

    if (dto.direction === GoalLedgerDirection.OUTGOING) {
      const allocatedFromAccountToGoal = await this.computeGoalAllocatedFromAccount(
        goalId,
        dto.accountId,
      );
      if (allocatedFromAccountToGoal < amountNum) {
        throw new BadRequestException(
          `Cannot adjust outgoing ${amountNum}. Only ${allocatedFromAccountToGoal.toFixed(2)} available from this account in this goal.`,
        );
      }
    }

    return this.prisma.goalLedger.create({
      data: {
        goalId,
        accountId: dto.accountId,
        amount: amountNum,
        direction: dto.direction,
        type: GoalLedgerType.ADJUST,
        note: dto.note,
      },
      include: {
        account: { select: { id: true, accountName: true, accountType: true } },
      },
    });
  }

  async getLedgers(userId: string, goalId: string) {
    await this.checkPremiumAccess(userId);
    const goal = await this.prisma.financialGoal.findFirst({ where: { id: goalId, userId } });
    if (!goal) throw new NotFoundException('Goal not found');

    return this.prisma.goalLedger.findMany({
      where: { goalId },
      include: {
        account: { select: { id: true, accountName: true, accountType: true } },
        referenceTransaction: {
          select: {
            id: true,
            transactionType: true,
            amount: true,
            transactionDate: true,
            description: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
