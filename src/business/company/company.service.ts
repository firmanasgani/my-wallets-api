import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LogsService } from '../../logs/logs.service';
import { MinioService } from '../../common/minio/minio.service';
import {
  ChartOfAccountSubType,
  ChartOfAccountType,
  Company,
  CompanyMemberRole,
  CompanyMemberStatus,
  LogActionType,
} from '@prisma/client';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { randomUUID } from 'crypto';

// ── Default Chart of Accounts ──────────────────────────────────────────────
// 28 accounts auto-generated when a company is created.
// subType = null for balance-sheet accounts; set for P&L classification.

const DEFAULT_CHART_OF_ACCOUNTS: {
  code: string;
  name: string;
  type: ChartOfAccountType;
  subType?: ChartOfAccountSubType;
}[] = [
  // ── ASSETS ──
  { code: '1-001', name: 'Kas',                                           type: ChartOfAccountType.ASSET },
  { code: '1-002', name: 'Bank',                                          type: ChartOfAccountType.ASSET },
  { code: '1-003', name: 'Piutang Usaha',                                 type: ChartOfAccountType.ASSET },
  { code: '1-004', name: 'Aset Tetap',                                    type: ChartOfAccountType.ASSET },
  { code: '1-005', name: 'Akumulasi Penyusutan Aset Tetap',               type: ChartOfAccountType.ASSET },
  { code: '1-006', name: 'Aset Tidak Berwujud',                          type: ChartOfAccountType.ASSET },
  { code: '1-007', name: 'Akumulasi Amortisasi Aset Tidak Berwujud',      type: ChartOfAccountType.ASSET },

  // ── LIABILITIES ──
  { code: '2-001', name: 'Hutang Usaha',                                  type: ChartOfAccountType.LIABILITY },
  { code: '2-002', name: 'Hutang Pajak (PPN)',                            type: ChartOfAccountType.LIABILITY },
  { code: '2-003', name: 'Hutang PPh 21',                                 type: ChartOfAccountType.LIABILITY },
  { code: '2-004', name: 'Hutang PPh 22',                                 type: ChartOfAccountType.LIABILITY },
  { code: '2-005', name: 'Hutang PPh 23',                                 type: ChartOfAccountType.LIABILITY },
  { code: '2-006', name: 'Hutang PPh Pasal 4 Ayat 2',                    type: ChartOfAccountType.LIABILITY },
  { code: '2-007', name: 'Hutang PPh 15',                                 type: ChartOfAccountType.LIABILITY },

  // ── EQUITY ──
  { code: '3-001', name: 'Modal Pemilik',                                 type: ChartOfAccountType.EQUITY },
  { code: '3-002', name: 'Laba Ditahan',                                  type: ChartOfAccountType.EQUITY },

  // ── REVENUE (operating) ──
  { code: '4-001', name: 'Pendapatan Penjualan',                          type: ChartOfAccountType.REVENUE, subType: ChartOfAccountSubType.OPERATING },
  { code: '4-002', name: 'Pendapatan Jasa',                               type: ChartOfAccountType.REVENUE, subType: ChartOfAccountSubType.OPERATING },

  // ── REVENUE (non-operating) ──
  { code: '6-001', name: 'Pendapatan Luar Usaha',                         type: ChartOfAccountType.REVENUE, subType: ChartOfAccountSubType.NON_OPERATING },
  { code: '6-002', name: 'Laba Pelepasan Aset',                           type: ChartOfAccountType.REVENUE, subType: ChartOfAccountSubType.NON_OPERATING },

  // ── EXPENSE (COGS) ──
  { code: '5-006', name: 'Harga Pokok Penjualan (HPP)',                   type: ChartOfAccountType.EXPENSE, subType: ChartOfAccountSubType.COGS },

  // ── EXPENSE (operating) ──
  { code: '5-001', name: 'Beban Operasional',                             type: ChartOfAccountType.EXPENSE, subType: ChartOfAccountSubType.OPERATING },
  { code: '5-002', name: 'Beban Gaji',                                    type: ChartOfAccountType.EXPENSE, subType: ChartOfAccountSubType.OPERATING },
  { code: '5-003', name: 'Beban Sewa',                                    type: ChartOfAccountType.EXPENSE, subType: ChartOfAccountSubType.OPERATING },
  { code: '5-004', name: 'Beban Penyusutan Aset Tetap',                   type: ChartOfAccountType.EXPENSE, subType: ChartOfAccountSubType.OPERATING },
  { code: '5-005', name: 'Beban Amortisasi Aset Tidak Berwujud',          type: ChartOfAccountType.EXPENSE, subType: ChartOfAccountSubType.OPERATING },

  // ── EXPENSE (non-operating) ──
  { code: '7-001', name: 'Beban Luar Usaha',                              type: ChartOfAccountType.EXPENSE, subType: ChartOfAccountSubType.NON_OPERATING },
  { code: '7-002', name: 'Rugi Pelepasan Aset',                           type: ChartOfAccountType.EXPENSE, subType: ChartOfAccountSubType.NON_OPERATING },
];

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logsService: LogsService,
    private readonly minioService: MinioService,
  ) {}

  async withResolvedLogoUrl(company: Company): Promise<Company & { logoPresignedUrl: string | null }> {
    if (!company.logoUrl) return { ...company, logoPresignedUrl: null };
    try {
      const url = await this.minioService.getFileUrl(company.logoUrl);
      return { ...company, logoPresignedUrl: url };
    } catch {
      return { ...company, logoPresignedUrl: null };
    }
  }

  async create(userId: string, dto: CreateCompanyDto): Promise<Company> {
    const existing = await this.prisma.company.findUnique({ where: { ownerId: userId } });
    if (existing) throw new BadRequestException('You already have a company.');

    const company = await this.prisma.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
        data: {
          ownerId: userId,
          name: dto.name,
          npwp: dto.npwp,
          address: dto.address,
          phone: dto.phone,
          email: dto.email,
          taxEnabled: dto.taxEnabled ?? true,
          taxRate: dto.taxRate ?? 11,
          currency: dto.currency ?? 'IDR',
          requiresApprovalWorkflow: false,
        },
      });

      await tx.companyMember.create({
        data: {
          companyId: newCompany.id,
          userId,
          role: CompanyMemberRole.OWNER,
          status: CompanyMemberStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });

      await tx.chartOfAccount.createMany({
        data: DEFAULT_CHART_OF_ACCOUNTS.map((coa) => ({
          companyId: newCompany.id,
          code: coa.code,
          name: coa.name,
          type: coa.type,
          subType: coa.subType ?? null,
          isSystem: true,
        })),
      });

      return newCompany;
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_COMPANY_CREATE,
      entityType: 'Company',
      entityId: company.id,
      description: `Company "${company.name}" created with ${DEFAULT_CHART_OF_ACCOUNTS.length} default chart of accounts.`,
      details: { companyName: company.name },
    });

    return company;
  }

  async findByUser(userId: string): Promise<Company> {
    const member = await this.prisma.companyMember.findFirst({
      where: { userId, status: CompanyMemberStatus.ACTIVE },
      include: { company: true },
    });

    if (!member) throw new NotFoundException('No active company found for this user.');
    return member.company;
  }

  async update(userId: string, company: Company, dto: UpdateCompanyDto): Promise<Company> {
    const updated = await this.prisma.company.update({
      where: { id: company.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.npwp !== undefined && { npwp: dto.npwp }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.taxEnabled !== undefined && { taxEnabled: dto.taxEnabled }),
        ...(dto.taxRate !== undefined && { taxRate: dto.taxRate }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.requiresApprovalWorkflow !== undefined && {
          requiresApprovalWorkflow: dto.requiresApprovalWorkflow,
        }),
      },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_COMPANY_UPDATE,
      entityType: 'Company',
      entityId: company.id,
      description: `Company "${updated.name}" updated.`,
      details: { ...dto },
    });

    return updated;
  }

  async uploadLogo(userId: string, company: Company, file: Express.Multer.File): Promise<Company> {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new BadRequestException('File size must not exceed 2MB.');
    }

    const ext = file.originalname.split('.').pop();
    const filePath = `company-logos/${company.id}-${Date.now()}-${randomUUID()}.${ext}`;

    await this.minioService.uploadFile(file, filePath);
    if (company.logoUrl) await this.minioService.deleteFile(company.logoUrl).catch(() => null);

    const updated = await this.prisma.company.update({
      where: { id: company.id },
      data: { logoUrl: filePath },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_COMPANY_UPDATE,
      entityType: 'Company',
      entityId: company.id,
      description: `Company "${company.name}" logo uploaded.`,
      details: { logoUrl: filePath },
    });

    return this.withResolvedLogoUrl(updated);
  }

  async deleteLogo(userId: string, company: Company): Promise<Company & { logoPresignedUrl: null }> {
    if (!company.logoUrl) throw new BadRequestException('Company does not have a logo.');

    await this.minioService.deleteFile(company.logoUrl).catch(() => null);

    const updated = await this.prisma.company.update({
      where: { id: company.id },
      data: { logoUrl: null },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_COMPANY_UPDATE,
      entityType: 'Company',
      entityId: company.id,
      description: `Company "${company.name}" logo deleted.`,
      details: {},
    });

    return { ...updated, logoPresignedUrl: null };
  }
}
