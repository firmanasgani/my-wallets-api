import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Company } from '@prisma/client';
import { CreateCompanyBankAccountDto } from './dto/create-company-bank-account.dto';
import { UpdateCompanyBankAccountDto } from './dto/update-company-bank-account.dto';

@Injectable()
export class CompanyBankAccountsService {
  constructor(private prisma: PrismaService) {}

  async findAll(company: Company) {
    return this.prisma.companyBankAccount.findMany({
      where: { companyId: company.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findById(companyId: string, id: string) {
    const account = await this.prisma.companyBankAccount.findFirst({
      where: { id, companyId },
    });
    if (!account) throw new NotFoundException('Bank account not found.');
    return account;
  }

  async create(company: Company, dto: CreateCompanyBankAccountDto) {
    if (dto.isDefault) {
      await this.prisma.companyBankAccount.updateMany({
        where: { companyId: company.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.companyBankAccount.create({
      data: {
        companyId: company.id,
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        accountHolder: dto.accountHolder,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async update(companyId: string, id: string, dto: UpdateCompanyBankAccountDto) {
    const account = await this.prisma.companyBankAccount.findFirst({
      where: { id, companyId },
    });
    if (!account) throw new NotFoundException('Bank account not found.');

    if (dto.isDefault) {
      await this.prisma.companyBankAccount.updateMany({
        where: { companyId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.companyBankAccount.update({
      where: { id },
      data: {
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        accountHolder: dto.accountHolder,
        isDefault: dto.isDefault,
      },
    });
  }

  async setDefault(companyId: string, id: string) {
    const account = await this.prisma.companyBankAccount.findFirst({
      where: { id, companyId },
    });
    if (!account) throw new NotFoundException('Bank account not found.');

    await this.prisma.companyBankAccount.updateMany({
      where: { companyId, isDefault: true },
      data: { isDefault: false },
    });

    return this.prisma.companyBankAccount.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  async delete(companyId: string, id: string) {
    const account = await this.prisma.companyBankAccount.findFirst({
      where: { id, companyId },
    });
    if (!account) throw new NotFoundException('Bank account not found.');

    await this.prisma.companyBankAccount.delete({ where: { id } });
    return { message: 'Bank account deleted.' };
  }
}
