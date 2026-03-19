import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChartOfAccountType, Company } from '@prisma/client';
import { CreateChartOfAccountDto } from './dto/create-chart-of-accounts.dto';
import { UpdateChartOfAccountsDto } from './dto/update-chart-of-accounts.dto';

@Injectable()
export class ChartOfAccountsService {
  constructor(private prisma: PrismaService) {}

  async findAll(company: Company) {
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { companyId: company.id },
      orderBy: { code: 'asc' },
    });

    // Group by type for a structured response
    const grouped: Record<ChartOfAccountType, typeof accounts> = {
      ASSET: [],
      LIABILITY: [],
      EQUITY: [],
      REVENUE: [],
      EXPENSE: [],
    };

    for (const account of accounts) {
      grouped[account.type].push(account);
    }

    return grouped;
  }

  async findById(id: string) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id }
    })
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async create(company: Company, dto: CreateChartOfAccountDto) {
    const account = await this.prisma.chartOfAccount.create({
      data: {
        companyId: company.id,
        code: dto.code,
        name: dto.name,
        type: dto.type,
      },
    });
    return account;
  }

  async update(id: string, dto: UpdateChartOfAccountsDto) {
    const account = await this.prisma.chartOfAccount.update({
      where: { id },
      data: dto,
    });
    return account;
  }

  async delete(id: string) {
    const account = await this.prisma.chartOfAccount.delete({
      where: { id },
    });
    return account;
  }
}
