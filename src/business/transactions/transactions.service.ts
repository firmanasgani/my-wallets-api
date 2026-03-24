import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Company, JournalLineType, LogActionType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LogsService } from '../../logs/logs.service';
import { CreateJournalEntryDto } from './dto/create-transaction.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private logsService: LogsService,
  ) {}

  async findAll(company: Company, dto: ListTransactionsDto) {
    const { startDate, endDate, coaId, contactId } = dto;
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.JournalEntryWhereInput = {
      companyId: company.id,
      ...(startDate || endDate
        ? {
            transactionDate: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate) } : {}),
            },
          }
        : {}),
      ...(coaId
        ? { lines: { some: { coaId } } }
        : {}),
      ...(contactId
        ? { lines: { some: { contactId } } }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        include: {
          lines: {
            include: {
              coa: { select: { id: true, code: true, name: true, type: true } },
              contact: { select: { id: true, name: true, type: true } },
            },
            orderBy: [{ type: 'asc' }, { amount: 'desc' }],
          },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(company: Company, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, companyId: company.id },
      include: {
        lines: {
          include: {
            coa: { select: { id: true, code: true, name: true, type: true } },
            contact: { select: { id: true, name: true, type: true } },
          },
          orderBy: [{ type: 'asc' }, { amount: 'desc' }],
        },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });

    if (!entry) {
      throw new NotFoundException('Journal entry not found.');
    }

    return entry;
  }

  async create(userId: string, company: Company, dto: CreateJournalEntryDto) {
    this.validateBalance(dto.lines);

    const coaIds = [...new Set(dto.lines.map((l) => l.coaId))];
    const contactIds = [
      ...new Set(dto.lines.map((l) => l.contactId).filter(Boolean) as string[]),
    ];

    const [coas, contacts] = await Promise.all([
      this.prisma.chartOfAccount.findMany({
        where: { id: { in: coaIds }, companyId: company.id },
        select: { id: true, code: true, name: true },
      }),
      contactIds.length > 0
        ? this.prisma.contact.findMany({
            where: { id: { in: contactIds }, companyId: company.id },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

    if (coas.length !== coaIds.length) {
      throw new NotFoundException(
        'One or more COA accounts not found in this company.',
      );
    }
    if (contacts.length !== contactIds.length) {
      throw new NotFoundException(
        'One or more contacts not found in this company.',
      );
    }

    const entry = await this.prisma.journalEntry.create({
      data: {
        companyId: company.id,
        description: dto.description,
        transactionDate: new Date(dto.transactionDate),
        isSystemGenerated: false,
        createdByUserId: userId,
        lines: {
          create: dto.lines.map((line) => ({
            coaId: line.coaId,
            type: line.type,
            amount: new Prisma.Decimal(line.amount),
            description: line.description ?? null,
            contactId: line.contactId ?? null,
          })),
        },
      },
      include: {
        lines: {
          include: {
            coa: { select: { id: true, code: true, name: true, type: true } },
            contact: { select: { id: true, name: true, type: true } },
          },
          orderBy: [{ type: 'asc' }, { amount: 'desc' }],
        },
      },
    });

    const coaMap = Object.fromEntries(coas.map((c) => [c.id, c]));
    const totalDebit = dto.lines
      .filter((l) => l.type === JournalLineType.DEBIT)
      .reduce((sum, l) => sum + l.amount, 0);

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_JOURNAL_CREATE,
      entityType: 'JournalEntry',
      entityId: entry.id,
      description: `Manual journal entry: "${dto.description}" — ${dto.lines.length} lines, total debit: ${totalDebit}`,
      details: {
        lineCount: dto.lines.length,
        totalDebit,
        lines: dto.lines.map((l) => ({
          coaCode: coaMap[l.coaId]?.code,
          coaName: coaMap[l.coaId]?.name,
          type: l.type,
          amount: l.amount,
        })),
      },
    });

    return entry;
  }

  async remove(userId: string, company: Company, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, companyId: company.id },
    });

    if (!entry) {
      throw new NotFoundException('Journal entry not found.');
    }

    if (entry.isSystemGenerated) {
      throw new BadRequestException(
        'Cannot delete a journal entry generated from an invoice.',
      );
    }

    await this.prisma.journalEntry.delete({ where: { id } });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_JOURNAL_DELETE,
      entityType: 'JournalEntry',
      entityId: id,
      description: `Manual journal entry deleted: "${entry.description}"`,
      details: {},
    });

    return { message: 'Journal entry deleted.' };
  }

  private validateBalance(lines: CreateJournalEntryDto['lines']) {
    const debitLines = lines.filter((l) => l.type === JournalLineType.DEBIT);
    const creditLines = lines.filter((l) => l.type === JournalLineType.CREDIT);

    if (debitLines.length === 0) {
      throw new BadRequestException('Journal entry must have at least one DEBIT line.');
    }
    if (creditLines.length === 0) {
      throw new BadRequestException('Journal entry must have at least one CREDIT line.');
    }

    const totalDebit = debitLines.reduce((sum, l) => sum + l.amount, 0);
    const totalCredit = creditLines.reduce((sum, l) => sum + l.amount, 0);

    // Round to 2 decimal places to avoid floating-point issues
    const debitRounded = Math.round(totalDebit * 100);
    const creditRounded = Math.round(totalCredit * 100);

    if (debitRounded !== creditRounded) {
      throw new BadRequestException(
        `Journal entry is not balanced. Total debit (${totalDebit}) ≠ total credit (${totalCredit}).`,
      );
    }
  }
}
