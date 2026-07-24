import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LogActionType, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { LogsService } from 'src/logs/logs.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class AdminSubscriptionPlansService {
  constructor(
    private prisma: PrismaService,
    private logsService: LogsService,
  ) {}

  findAll() {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: { price: 'asc' },
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async create(dto: CreatePlanDto, adminId: string) {
    const existing = await this.prisma.subscriptionPlan.findFirst({
      where: { OR: [{ code: dto.code }, { name: dto.name }] },
    });
    if (existing) {
      throw new ConflictException('A plan with this name or code already exists');
    }

    const plan = await this.prisma.subscriptionPlan.create({ data: dto });

    await this.logsService.create({
      adminId,
      actionType: LogActionType.PLAN_CREATE,
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      description: `Plan ${plan.name} (${plan.code}) created`,
      details: { code: plan.code },
    });

    return plan;
  }

  async update(id: string, dto: UpdatePlanDto, adminId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');

    const updated = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: dto as Prisma.SubscriptionPlanUpdateInput,
    });

    await this.logsService.create({
      adminId,
      actionType: LogActionType.PLAN_UPDATE,
      entityType: 'SubscriptionPlan',
      entityId: updated.id,
      description: `Plan ${updated.name} (${updated.code}) updated`,
      details: { changes: { ...dto } as Prisma.JsonObject },
    });

    return updated;
  }

  /**
   * "Delete" a plan — existing UserSubscription/PaymentTransaction rows
   * reference planId, so a hard delete would break those. Soft-disable
   * instead: the plan stops showing up in the public plan list.
   */
  async disable(id: string, adminId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');

    const updated = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: { isActive: false },
    });

    await this.logsService.create({
      adminId,
      actionType: LogActionType.PLAN_DISABLE,
      entityType: 'SubscriptionPlan',
      entityId: updated.id,
      description: `Plan ${updated.name} (${updated.code}) disabled`,
    });

    return updated;
  }
}
