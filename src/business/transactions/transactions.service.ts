import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Company,
  CompanyMember,
  CompanyMemberRole,
  JournalEntryStatus,
  JournalLineType,
  LogActionType,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LogsService } from '../../logs/logs.service';
import { MinioService } from '../../common/minio/minio.service';
import { CreateJournalEntryDto } from './dto/create-transaction.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { RejectEntryDto } from './dto/reject-entry.dto';

/** Roles that can perform the CHECKER action */
const CAN_CHECK: CompanyMemberRole[] = [
  CompanyMemberRole.CHECKER,
  CompanyMemberRole.ADMIN,
  CompanyMemberRole.OWNER,
];

/** Roles that can perform the APPROVER action */
const CAN_APPROVE: CompanyMemberRole[] = [
  CompanyMemberRole.ADMIN,
  CompanyMemberRole.OWNER,
];

const ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ATTACHMENT_ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const ATTACHMENT_MAX_PER_ENTRY = 5;

// ── Include shape reused across findOne/findAll ───────────────────────────────
const ENTRY_INCLUDE = {
  lines: {
    include: {
      coa: { select: { id: true, code: true, name: true, type: true } },
      contact: { select: { id: true, name: true, type: true } },
    },
    orderBy: [{ type: 'asc' as const }, { amount: 'desc' as const }],
  },
  invoice: { select: { id: true, invoiceNumber: true } },
  attachments: {
    select: { id: true, fileName: true, mimeType: true, fileSize: true, createdAt: true },
  },
  checker: { select: { id: true, fullName: true, email: true } },
  approver: { select: { id: true, fullName: true, email: true } },
};

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logsService: LogsService,
    private readonly minioService: MinioService,
  ) {}

  // ─── List ─────────────────────────────────────────────────────────────────

  async findAll(company: Company, dto: ListTransactionsDto) {
    const { startDate, endDate, coaId, contactId, status } = dto;
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.JournalEntryWhereInput = {
      companyId: company.id,
      ...(status ? { status } : {}),
      ...(startDate || endDate
        ? { transactionDate: { ...(startDate ? { gte: new Date(startDate) } : {}), ...(endDate ? { lte: new Date(endDate) } : {}) } }
        : {}),
      ...(coaId ? { lines: { some: { coaId } } } : {}),
      ...(contactId ? { lines: { some: { contactId } } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        include: ENTRY_INCLUDE,
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(company: Company, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, companyId: company.id },
      include: ENTRY_INCLUDE,
    });

    if (!entry) throw new NotFoundException('Journal entry not found.');
    return entry;
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(userId: string, company: Company, dto: CreateJournalEntryDto, files: Express.Multer.File[] = []) {
    // Validate files upfront before creating the entry
    if (files.length > ATTACHMENT_MAX_PER_ENTRY) {
      throw new BadRequestException(`Maximum ${ATTACHMENT_MAX_PER_ENTRY} attachments per entry.`);
    }
    for (const file of files) {
      if (!ATTACHMENT_ALLOWED_MIMES.includes(file.mimetype)) {
        throw new BadRequestException(`Invalid file type for "${file.originalname}". Allowed: PDF, JPEG, PNG, WebP.`);
      }
      if (file.size > ATTACHMENT_MAX_SIZE) {
        throw new BadRequestException(`File "${file.originalname}" exceeds 10 MB limit.`);
      }
    }

    this.validateBalance(dto.lines);

    const coaIds = [...new Set(dto.lines.map((l) => l.coaId))];
    const contactIds = [...new Set(dto.lines.map((l) => l.contactId).filter(Boolean) as string[])];

    const [coas, contacts] = await Promise.all([
      this.prisma.chartOfAccount.findMany({
        where: { id: { in: coaIds }, companyId: company.id },
        select: { id: true, code: true, name: true },
      }),
      contactIds.length > 0
        ? this.prisma.contact.findMany({ where: { id: { in: contactIds }, companyId: company.id }, select: { id: true } })
        : Promise.resolve([]),
    ]);

    if (coas.length !== coaIds.length) throw new NotFoundException('One or more COA accounts not found in this company.');
    if (contacts.length !== contactIds.length) throw new NotFoundException('One or more contacts not found in this company.');

    // Determine initial status based on company setting
    const initialStatus: JournalEntryStatus = company.requiresApprovalWorkflow
      ? JournalEntryStatus.DRAFT
      : JournalEntryStatus.APPROVED;

    const entry = await this.prisma.journalEntry.create({
      data: {
        companyId: company.id,
        description: dto.description,
        transactionDate: new Date(dto.transactionDate),
        isSystemGenerated: false,
        status: initialStatus,
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
      include: ENTRY_INCLUDE,
    });

    const coaMap = Object.fromEntries(coas.map((c) => [c.id, c]));
    const totalDebit = dto.lines.filter((l) => l.type === JournalLineType.DEBIT).reduce((s, l) => s + l.amount, 0);

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_JOURNAL_CREATE,
      entityType: 'JournalEntry',
      entityId: entry.id,
      description: `Manual journal entry: "${dto.description}" — ${dto.lines.length} lines, total debit: ${totalDebit}, status: ${initialStatus}`,
      details: {
        lineCount: dto.lines.length,
        totalDebit,
        status: initialStatus,
        lines: dto.lines.map((l) => ({ coaCode: coaMap[l.coaId]?.code, coaName: coaMap[l.coaId]?.name, type: l.type, amount: l.amount })),
      },
    });

    // Upload attachments if provided
    if (files.length > 0) {
      await Promise.all(
        files.map(async (file) => {
          const ext = file.originalname.split('.').pop();
          const filePath = `journal-attachments/${company.id}/${entry.id}/${Date.now()}-${randomUUID()}.${ext}`;
          await this.minioService.uploadFile(file, filePath);
          await this.prisma.journalEntryAttachment.create({
            data: {
              journalEntryId: entry.id,
              companyId: company.id,
              fileName: file.originalname,
              fileUrl: filePath,
              fileSize: file.size,
              mimeType: file.mimetype,
              uploadedByUserId: userId,
            },
          });
        }),
      );
      return this.findOne(company, entry.id);
    }

    return entry;
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async remove(userId: string, company: Company, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({ where: { id, companyId: company.id } });
    if (!entry) throw new NotFoundException('Journal entry not found.');
    if (entry.isSystemGenerated) throw new BadRequestException('Cannot delete a system-generated journal entry.');

    // Only DRAFT or REJECTED entries may be deleted
    if (entry.status !== JournalEntryStatus.DRAFT && entry.status !== JournalEntryStatus.REJECTED) {
      throw new BadRequestException('Only DRAFT or REJECTED entries can be deleted.');
    }

    await this.prisma.journalEntry.delete({ where: { id } });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_JOURNAL_DELETE,
      entityType: 'JournalEntry',
      entityId: id,
      description: `Manual journal entry deleted: "${entry.description}"`,
    });

    return { message: 'Journal entry deleted.' };
  }

  // ─── Approval Workflow ────────────────────────────────────────────────────

  async submit(userId: string, company: Company, _member: CompanyMember, id: string) {
    const entry = await this.findManualOrThrow(company.id, id);

    if (entry.status !== JournalEntryStatus.DRAFT && entry.status !== JournalEntryStatus.REJECTED) {
      throw new BadRequestException(`Cannot submit an entry with status "${entry.status}".`);
    }

    const updated = await this.prisma.journalEntry.update({
      where: { id },
      data: { status: JournalEntryStatus.PENDING_CHECK },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_JOURNAL_SUBMITTED,
      entityType: 'JournalEntry',
      entityId: id,
      description: `Journal entry "${entry.description}" submitted for checking.`,
    });

    return updated;
  }

  async check(userId: string, company: Company, member: CompanyMember, id: string) {
    if (!CAN_CHECK.includes(member.role)) {
      throw new ForbiddenException('Insufficient role to perform check action.');
    }

    const entry = await this.findManualOrThrow(company.id, id);
    if (entry.status !== JournalEntryStatus.PENDING_CHECK) {
      throw new BadRequestException(`Entry is not in PENDING_CHECK status.`);
    }

    const updated = await this.prisma.journalEntry.update({
      where: { id },
      data: {
        status: JournalEntryStatus.PENDING_APPROVAL,
        checkerUserId: userId,
        checkedAt: new Date(),
      },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_JOURNAL_CHECKED,
      entityType: 'JournalEntry',
      entityId: id,
      description: `Journal entry "${entry.description}" checked.`,
    });

    return updated;
  }

  async approve(userId: string, company: Company, member: CompanyMember, id: string) {
    if (!CAN_APPROVE.includes(member.role)) {
      throw new ForbiddenException('Insufficient role to perform approve action.');
    }

    const entry = await this.findManualOrThrow(company.id, id);
    if (entry.status !== JournalEntryStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Entry is not in PENDING_APPROVAL status.`);
    }

    const updated = await this.prisma.journalEntry.update({
      where: { id },
      data: {
        status: JournalEntryStatus.APPROVED,
        approverUserId: userId,
        approvedAt: new Date(),
      },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_JOURNAL_APPROVED,
      entityType: 'JournalEntry',
      entityId: id,
      description: `Journal entry "${entry.description}" approved.`,
    });

    return updated;
  }

  async reject(userId: string, company: Company, member: CompanyMember, id: string, dto: RejectEntryDto) {
    const canReject = [...CAN_CHECK]; // Checker and above can reject
    if (!canReject.includes(member.role)) {
      throw new ForbiddenException('Insufficient role to reject entries.');
    }

    const entry = await this.findManualOrThrow(company.id, id);
    if (entry.status !== JournalEntryStatus.PENDING_CHECK && entry.status !== JournalEntryStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Entry with status "${entry.status}" cannot be rejected.`);
    }

    const updated = await this.prisma.journalEntry.update({
      where: { id },
      data: {
        status: JournalEntryStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionNote: dto.note ?? null,
      },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_JOURNAL_REJECTED,
      entityType: 'JournalEntry',
      entityId: id,
      description: `Journal entry "${entry.description}" rejected. Note: ${dto.note ?? '—'}`,
    });

    return updated;
  }

  // ─── Attachments ──────────────────────────────────────────────────────────

  async listAttachments(company: Company, id: string) {
    await this.findEntryOrThrow(company.id, id);

    const attachments = await this.prisma.journalEntryAttachment.findMany({
      where: { journalEntryId: id },
      include: { uploadedBy: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Resolve presigned URLs (parallel, graceful on error)
    return Promise.all(
      attachments.map(async (att) => {
        let url: string | null = null;
        try { url = await this.minioService.getFileUrl(att.fileUrl); } catch { /* ignore */ }
        return { ...att, presignedUrl: url };
      }),
    );
  }

  async uploadAttachment(
    userId: string,
    company: Company,
    member: CompanyMember,
    id: string,
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required.');
    }

    const entry = await this.findEntryOrThrow(company.id, id);

    if (!ATTACHMENT_ALLOWED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Allowed: PDF, JPEG, PNG, WebP.');
    }
    if (file.size > ATTACHMENT_MAX_SIZE) {
      throw new BadRequestException('File size must not exceed 10 MB.');
    }

    // Block upload while entry is under review
    if (
      entry.status === JournalEntryStatus.PENDING_CHECK ||
      entry.status === JournalEntryStatus.PENDING_APPROVAL
    ) {
      throw new ForbiddenException('Cannot upload attachments while entry is under review. Reject the entry first, then re-upload.');
    }

    // APPROVED entries: only ADMIN/OWNER may add attachments after approval
    if (entry.status === JournalEntryStatus.APPROVED && !CAN_APPROVE.includes(member.role)) {
      throw new ForbiddenException('Only ADMIN/OWNER can attach files to an approved entry.');
    }

    const count = await this.prisma.journalEntryAttachment.count({ where: { journalEntryId: id } });
    if (count >= ATTACHMENT_MAX_PER_ENTRY) {
      throw new BadRequestException(`Maximum ${ATTACHMENT_MAX_PER_ENTRY} attachments per entry.`);
    }

    const ext = file.originalname.split('.').pop();
    const filePath = `journal-attachments/${company.id}/${id}/${Date.now()}-${randomUUID()}.${ext}`;
    await this.minioService.uploadFile(file, filePath);

    const attachment = await this.prisma.journalEntryAttachment.create({
      data: {
        journalEntryId: id,
        companyId: company.id,
        fileName: file.originalname,
        fileUrl: filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedByUserId: userId,
      },
    });

    return attachment;
  }

  async deleteAttachment(
    userId: string,
    company: Company,
    member: CompanyMember,
    entryId: string,
    attachmentId: string,
  ) {
    await this.findEntryOrThrow(company.id, entryId);

    const attachment = await this.prisma.journalEntryAttachment.findFirst({
      where: { id: attachmentId, journalEntryId: entryId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');

    // Only uploader or ADMIN/OWNER can delete
    const isUploader = attachment.uploadedByUserId === userId;
    if (!isUploader && !CAN_APPROVE.includes(member.role)) {
      throw new ForbiddenException('You can only delete your own attachments.');
    }

    await Promise.all([
      this.minioService.deleteFile(attachment.fileUrl).catch(() => null),
      this.prisma.journalEntryAttachment.delete({ where: { id: attachmentId } }),
    ]);

    return { message: 'Attachment deleted.' };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async findEntryOrThrow(companyId: string, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({ where: { id, companyId } });
    if (!entry) throw new NotFoundException('Journal entry not found.');
    return entry;
  }

  private async findManualOrThrow(companyId: string, id: string) {
    const entry = await this.findEntryOrThrow(companyId, id);
    if (entry.isSystemGenerated) throw new BadRequestException('Cannot modify a system-generated entry.');
    return entry;
  }

  private validateBalance(lines: CreateJournalEntryDto['lines']) {
    const debitLines = lines.filter((l) => l.type === JournalLineType.DEBIT);
    const creditLines = lines.filter((l) => l.type === JournalLineType.CREDIT);

    if (debitLines.length === 0) throw new BadRequestException('At least one DEBIT line is required.');
    if (creditLines.length === 0) throw new BadRequestException('At least one CREDIT line is required.');

    const debitTotal = Math.round(debitLines.reduce((s, l) => s + l.amount, 0) * 100);
    const creditTotal = Math.round(creditLines.reduce((s, l) => s + l.amount, 0) * 100);

    if (debitTotal !== creditTotal) {
      throw new BadRequestException(
        `Journal entry is not balanced. Debit: ${debitTotal / 100} ≠ Credit: ${creditTotal / 100}.`,
      );
    }
  }
}
