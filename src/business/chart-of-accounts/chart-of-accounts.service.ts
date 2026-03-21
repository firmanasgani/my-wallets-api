import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

  async findById(companyId: string, id: string) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id, companyId },
    });
    if (!account) throw new NotFoundException('Chart of account not found.');
    return account;
  }

  async create(company: Company, dto: CreateChartOfAccountDto) {
    const existing = await this.prisma.chartOfAccount.findUnique({
      where: { companyId_code: { companyId: company.id, code: dto.code } },
    });
    if (existing) {
      throw new BadRequestException(`COA code "${dto.code}" already exists in this company.`);
    }

    return this.prisma.chartOfAccount.create({
      data: {
        companyId: company.id,
        code: dto.code,
        name: dto.name,
        type: dto.type,
        openingBalance: dto.openingBalance ?? 0,
        isSystem: false,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdateChartOfAccountsDto) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id, companyId },
    });
    if (!account) throw new NotFoundException('Chart of account not found.');
    if (account.isSystem) {
      throw new ForbiddenException('System accounts cannot be edited.');
    }

    return this.prisma.chartOfAccount.update({
      where: { id },
      data: dto,
    });
  }

  async delete(companyId: string, id: string) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id, companyId },
    });
    if (!account) throw new NotFoundException('Chart of account not found.');
    if (account.isSystem) {
      throw new ForbiddenException('System accounts cannot be deleted.');
    }

    // Guard: tidak bisa hapus jika sudah ada JournalLine yang mereferensikan
    const txCount = await this.prisma.journalLine.count({
      where: { coaId: id },
    });
    if (txCount > 0) {
      throw new BadRequestException(
        'Cannot delete this account because it is referenced by existing transactions.',
      );
    }

    await this.prisma.chartOfAccount.delete({ where: { id } });
    return { message: 'Chart of account deleted.' };
  }
}
