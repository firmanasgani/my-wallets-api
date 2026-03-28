import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MinioService } from '../../common/minio/minio.service';
import { Company, InvoiceStatus, LogActionType, Prisma } from '@prisma/client';
import { LogsService } from '../../logs/logs.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';
import { randomUUID } from 'crypto';
import { Resend } from 'resend';
import { buildInvoiceEmailHtml } from './invoice-email.template';

const EMAIL_COOLDOWN_MS = 10 * 60 * 1000; // 10 menit

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  private readonly emailCooldown = new Map<string, Date>();

  constructor(
    private prisma: PrismaService,
    private logsService: LogsService,
    private minioService: MinioService,
  ) {}

  // ───────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────

  private async generateInvoiceNumber(companyId: string): Promise<string> {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `INV-${yyyy}-${mm}-`;

    const last = await this.prisma.invoice.findFirst({
      where: { companyId, invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });

    let seq = 1;
    if (last) {
      const parts = last.invoiceNumber.split('-');
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }

    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private computeItems(
    rawItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      taxable?: boolean;
      discountAmount?: number;
    }>,
    taxEnabled: boolean,
    taxRate: Prisma.Decimal,
  ) {
    return rawItems.map((item) => {
      const qty = new Prisma.Decimal(item.quantity);
      const price = new Prisma.Decimal(item.unitPrice);
      const discount = new Prisma.Decimal(item.discountAmount ?? 0);
      const lineSubtotal = qty.mul(price);
      const lineAfterDiscount = lineSubtotal.sub(discount);
      const shouldTax = item.taxable && taxEnabled;
      const itemTaxRate = shouldTax ? taxRate : new Prisma.Decimal(0);
      const taxAmount = shouldTax
        ? lineAfterDiscount.mul(taxRate).div(100)
        : new Prisma.Decimal(0);
      const total = lineAfterDiscount.add(taxAmount);

      return {
        description: item.description,
        quantity: qty,
        unitPrice: price,
        discountAmount: discount,
        taxable: item.taxable ?? false,
        taxRate: itemTaxRate,
        taxAmount,
        total,
      };
    });
  }

  private computeTotals(computedItems: ReturnType<typeof this.computeItems>) {
    const subtotal = computedItems.reduce(
      (acc, i) => acc.add(i.quantity.mul(i.unitPrice).sub(i.discountAmount)),
      new Prisma.Decimal(0),
    );
    const taxAmount = computedItems.reduce(
      (acc, i) => acc.add(i.taxAmount),
      new Prisma.Decimal(0),
    );
    return { subtotal, taxAmount, totalAmount: subtotal.add(taxAmount) };
  }

  // ───────────────────────────────────────────────────
  // CRUD
  // ───────────────────────────────────────────────────

  async findAll(
    company: Company,
    status?: InvoiceStatus,
    search?: string,
    startDate?: string,
    endDate?: string,
    contactId?: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.InvoiceWhereInput = {
      companyId: company.id,
      ...(status ? { status } : {}),
      ...(contactId ? { contactId } : {}),
      ...(startDate || endDate
        ? {
            issueDate: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { invoiceNumber: { contains: search, mode: 'insensitive' } },
              { clientName: { contains: search, mode: 'insensitive' } },
              { clientEmail: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: { items: true, contact: { select: { id: true, name: true, type: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId },
      include: {
        items: true,
        contact: true,
        attachments: true,
        paymentBankAccount: true,
        taxConfig: true,
        company: { select: { taxEnabled: true, taxRate: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    return invoice;
  }

  async create(userId: string, company: Company, dto: CreateInvoiceDto) {
    let clientName = dto.clientName ?? '';
    let clientEmail = dto.clientEmail ?? null;
    let clientAddress = dto.clientAddress ?? null;

    if (dto.contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: dto.contactId, companyId: company.id },
      });
      if (!contact) throw new NotFoundException('Contact not found in this company.');
      clientName = contact.name;
      clientEmail = contact.email ?? null;
      clientAddress = contact.address ?? null;
    }

    if (!clientName) {
      throw new BadRequestException('clientName is required when contactId is not provided.');
    }

    if (dto.paymentBankAccountId) {
      const bankAccount = await this.prisma.companyBankAccount.findFirst({
        where: { id: dto.paymentBankAccountId, companyId: company.id },
      });
      if (!bankAccount) throw new NotFoundException('Bank account not found in this company.');
    }

    // PPN selalu dari company default, diterapkan per item
    const ppnRate = new Prisma.Decimal(company.taxRate.toString());
    const computedItems = this.computeItems(dto.items, company.taxEnabled, ppnRate);
    const { subtotal, taxAmount, totalAmount: subtotalPlusPpn } = this.computeTotals(computedItems);

    // Withholding tax (PPh, dll) dari taxConfig — diterapkan pada subtotal
    let withholdingTaxAmount = new Prisma.Decimal(0);
    let taxConfigId: string | null = null;

    if (dto.taxConfigId) {
      const taxConfig = await this.prisma.taxConfig.findFirst({
        where: { id: dto.taxConfigId, companyId: company.id },
      });
      if (!taxConfig) throw new NotFoundException('Tax config not found in this company.');
      if (!taxConfig.isActive) throw new BadRequestException('Tax config is inactive.');
      withholdingTaxAmount = subtotal.mul(taxConfig.rate).div(100);
      taxConfigId = taxConfig.id;
    }

    const totalAmount = subtotalPlusPpn.add(withholdingTaxAmount);
    const invoiceNumber = await this.generateInvoiceNumber(company.id);

    const invoice = await this.prisma.invoice.create({
      data: {
        companyId: company.id,
        contactId: dto.contactId ?? null,
        invoiceNumber,
        clientName,
        clientEmail,
        clientAddress,
        issueDate: new Date(dto.issueDate),
        dueDate: new Date(dto.dueDate),
        status: InvoiceStatus.DRAFT,
        subtotal,
        taxAmount,
        withholdingTaxAmount,
        totalAmount,
        notes: dto.notes ?? null,
        paymentBankAccountId: dto.paymentBankAccountId ?? null,
        taxConfigId,
        createdByUserId: userId,
        items: {
          create: computedItems.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discountAmount: i.discountAmount,
            taxable: i.taxable,
            taxRate: i.taxRate,
            taxAmount: i.taxAmount,
            total: i.total,
          })),
        },
      },
      include: { items: true },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_INVOICE_CREATE,
      entityType: 'Invoice',
      entityId: invoice.id,
      description: `Invoice ${invoiceNumber} created (DRAFT) for company "${company.name}".`,
      details: null,
    });

    return invoice;
  }

  async update(_userId: string, companyId: string, id: string, dto: UpdateInvoiceDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId },
      include: { company: true, taxConfig: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT invoices can be edited.');
    }

    let clientName: string | undefined = dto.clientName;
    let clientEmail: string | null | undefined = dto.clientEmail;
    let clientAddress: string | null | undefined = dto.clientAddress;

    if (dto.contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: dto.contactId, companyId },
      });
      if (!contact) throw new NotFoundException('Contact not found in this company.');
      clientName = contact.name;
      clientEmail = contact.email ?? null;
      clientAddress = contact.address ?? null;
    }

    if (dto.paymentBankAccountId) {
      const bankAccount = await this.prisma.companyBankAccount.findFirst({
        where: { id: dto.paymentBankAccountId, companyId },
      });
      if (!bankAccount) throw new NotFoundException('Bank account not found in this company.');
    }

    const company = invoice.company;
    const ppnRate = new Prisma.Decimal(company.taxRate.toString());

    // Resolve taxConfig baru jika dikirim
    let resolvedTaxConfig: { id: string; rate: Prisma.Decimal } | null = null;
    if (dto.taxConfigId !== undefined && dto.taxConfigId !== null) {
      const taxConfig = await this.prisma.taxConfig.findFirst({
        where: { id: dto.taxConfigId, companyId },
      });
      if (!taxConfig) throw new NotFoundException('Tax config not found in this company.');
      if (!taxConfig.isActive) throw new BadRequestException('Tax config is inactive.');
      resolvedTaxConfig = { id: taxConfig.id, rate: new Prisma.Decimal(taxConfig.rate.toString()) };
    }

    let subtotal: Prisma.Decimal | undefined;
    let taxAmount: Prisma.Decimal | undefined;
    let withholdingTaxAmount: Prisma.Decimal | undefined;
    let totalAmount: Prisma.Decimal | undefined;
    let itemUpdates: Prisma.InvoiceUpdateInput['items'] | undefined;

    if (dto.items) {
      const computedItems = this.computeItems(
        dto.items.map((i) => ({
          description: i.description ?? '',
          quantity: i.quantity ?? 1,
          unitPrice: i.unitPrice ?? 0,
          taxable: i.taxable,
          discountAmount: i.discountAmount,
        })),
        company.taxEnabled,
        ppnRate,
      );

      const totals = this.computeTotals(computedItems);
      subtotal = totals.subtotal;
      taxAmount = totals.taxAmount;

      // Hitung withholding tax dari taxConfig yang aktif
      const activeTaxConfig = resolvedTaxConfig ?? (
        dto.taxConfigId === null ? null : (invoice.taxConfig ? { id: invoice.taxConfig.id, rate: new Prisma.Decimal(invoice.taxConfig.rate.toString()) } : null)
      );
      withholdingTaxAmount = activeTaxConfig
        ? subtotal.mul(activeTaxConfig.rate).div(100)
        : new Prisma.Decimal(0);

      totalAmount = totals.totalAmount.add(withholdingTaxAmount);

      itemUpdates = {
        deleteMany: {},
        create: computedItems.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
          taxable: i.taxable,
          taxRate: i.taxRate,
          taxAmount: i.taxAmount,
          total: i.total,
        })),
      };
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        contactId: dto.contactId !== undefined ? (dto.contactId ?? null) : undefined,
        clientName,
        clientEmail,
        clientAddress,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes: dto.notes !== undefined ? (dto.notes ?? null) : undefined,
        paymentBankAccountId: dto.paymentBankAccountId !== undefined ? (dto.paymentBankAccountId ?? null) : undefined,
        taxConfigId: dto.taxConfigId !== undefined ? (dto.taxConfigId ?? null) : undefined,
        subtotal,
        taxAmount,
        withholdingTaxAmount,
        totalAmount,
        items: itemUpdates,
      },
      include: { items: true },
    });

    return updated;
  }

  async send(userId: string, companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId },
      include: {
        company: true,
        items: true,
        paymentBankAccount: true,
        taxConfig: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT invoices can be sent.');
    }

    const now = new Date();
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.SENT, sentAt: now },
    });

    // Kirim email ke clientEmail jika ada
    if (invoice.clientEmail) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const from = (process.env.SMTP_FROM || 'Moneytory <noreply@moneytory.com>').replace(
          /^["']|["']$/g,
          '',
        );

        const html = buildInvoiceEmailHtml({
          companyName: invoice.company.name,
          companyAddress: invoice.company.address,
          companyPhone: invoice.company.phone,
          companyEmail: invoice.company.email,
          invoiceNumber: invoice.invoiceNumber,
          status: InvoiceStatus.SENT,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          clientName: invoice.clientName,
          clientEmail: invoice.clientEmail,
          clientAddress: invoice.clientAddress,
          subtotal: invoice.subtotal,
          taxAmount: invoice.taxAmount,
          totalAmount: invoice.totalAmount,
          amountPaid: invoice.amountPaid,
          notes: invoice.notes,
          items: invoice.items,
          bankName: invoice.paymentBankAccount?.bankName ?? null,
          bankAccountNumber: invoice.paymentBankAccount?.accountNumber ?? null,
          bankAccountHolder: invoice.paymentBankAccount?.accountHolder ?? null,
          companyTaxEnabled: invoice.company.taxEnabled,
          companyTaxRate: Number(invoice.company.taxRate).toString(),
          withholdingTaxAmount: (invoice as any).withholdingTaxAmount ?? new Prisma.Decimal(0),
          taxConfigName: invoice.taxConfig?.name ?? null,
          taxConfigType: invoice.taxConfig?.type ?? null,
          taxConfigRate: invoice.taxConfig ? Number(invoice.taxConfig.rate).toString() : null,
        });

        await resend.emails.send({
          from,
          to: invoice.clientEmail,
          subject: `Invoice ${invoice.invoiceNumber} dari ${invoice.company.name}`,
          html,
        });

        this.emailCooldown.set(id, now);
      } catch (err) {
        this.logger.warn(`Failed to send invoice email for ${invoice.invoiceNumber}: ${err}`);
      }
    }

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_INVOICE_SENT,
      entityType: 'Invoice',
      entityId: id,
      description: `Invoice ${invoice.invoiceNumber} marked as SENT.`,
      details: null,
    });

    return updated;
  }

  async sendEmail(userId: string, companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId },
      include: {
        company: true,
        items: true,
        paymentBankAccount: true,
        taxConfig: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot resend email for a fully paid invoice.');
    }
    if (!invoice.clientEmail) {
      throw new BadRequestException('Invoice does not have a client email address.');
    }

    const now = new Date();
    if (invoice.status !== InvoiceStatus.DRAFT) {
      const lastSent = this.emailCooldown.get(id);
      if (lastSent && now.getTime() - lastSent.getTime() < EMAIL_COOLDOWN_MS) {
        const remainingMin = Math.ceil(
          (EMAIL_COOLDOWN_MS - (now.getTime() - lastSent.getTime())) / 1000 / 60,
        );
        throw new BadRequestException(
          `Email untuk invoice ini baru saja dikirim. Silakan tunggu ${remainingMin} menit lagi.`,
        );
      }
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = (process.env.SMTP_FROM || 'Moneytory <noreply@moneytory.com>').replace(
      /^["']|["']$/g,
      '',
    );

    const html = buildInvoiceEmailHtml({
      companyName: invoice.company.name,
      companyAddress: invoice.company.address,
      companyPhone: invoice.company.phone,
      companyEmail: invoice.company.email,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail,
      clientAddress: invoice.clientAddress,
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount,
      totalAmount: invoice.totalAmount,
      amountPaid: invoice.amountPaid,
      notes: invoice.notes,
      items: invoice.items,
      bankName: invoice.paymentBankAccount?.bankName ?? null,
      bankAccountNumber: invoice.paymentBankAccount?.accountNumber ?? null,
      bankAccountHolder: invoice.paymentBankAccount?.accountHolder ?? null,
      companyTaxEnabled: invoice.company.taxEnabled,
      companyTaxRate: Number(invoice.company.taxRate).toString(),
      withholdingTaxAmount: (invoice as any).withholdingTaxAmount ?? new Prisma.Decimal(0),
      taxConfigName: invoice.taxConfig?.name ?? null,
      taxConfigType: invoice.taxConfig?.type ?? null,
      taxConfigRate: invoice.taxConfig ? Number(invoice.taxConfig.rate).toString() : null,
    });

    await resend.emails.send({
      from,
      to: invoice.clientEmail,
      subject: `Invoice ${invoice.invoiceNumber} dari ${invoice.company.name}`,
      html,
    });

    this.emailCooldown.set(id, now);

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_INVOICE_SENT,
      entityType: 'Invoice',
      entityId: id,
      description: `Invoice ${invoice.invoiceNumber} email resent to ${invoice.clientEmail}.`,
      details: { status: invoice.status },
    });

    return { message: `Email invoice ${invoice.invoiceNumber} berhasil dikirim ke ${invoice.clientEmail}.` };
  }

  async pay(userId: string, companyId: string, id: string, dto: PayInvoiceDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId },
      include: { company: true, taxConfig: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    if (invoice.status !== InvoiceStatus.SENT && invoice.status !== InvoiceStatus.OVERDUE) {
      throw new BadRequestException('Only SENT or OVERDUE invoices can be paid.');
    }

    const paymentCoa = await this.prisma.chartOfAccount.findFirst({
      where: { id: dto.paymentCoaId, companyId },
    });
    if (!paymentCoa) throw new NotFoundException('Payment COA not found in this company.');

    const revenueCoa = await this.prisma.chartOfAccount.findFirst({
      where: { companyId, code: '4-001' },
    });
    if (!revenueCoa) {
      throw new NotFoundException('Revenue COA (4-001) not found. Please ensure default COA is set up.');
    }

    // Hitung sisa yang belum dibayar
    const totalAmount = new Prisma.Decimal(invoice.totalAmount.toString());
    const alreadyPaid = new Prisma.Decimal(invoice.amountPaid.toString());
    const remaining = totalAmount.sub(alreadyPaid);

    // Jumlah yang dibayar sekarang: jika dto.amount ada, gunakan itu; jika tidak, bayar penuh sisa
    const payNow = dto.amount
      ? new Prisma.Decimal(dto.amount)
      : remaining;

    if (payNow.lte(0)) {
      throw new BadRequestException('Payment amount must be greater than 0.');
    }
    if (payNow.gt(remaining)) {
      throw new BadRequestException(
        `Payment amount (${payNow}) exceeds remaining balance (${remaining}).`,
      );
    }

    const newAmountPaid = alreadyPaid.add(payNow);
    const isFullyPaid = newAmountPaid.gte(totalAmount);
    const paymentDate = new Date(dto.paymentDate);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          amountPaid: newAmountPaid,
          paymentCoaId: dto.paymentCoaId,
          paymentDate,
          paymentMethod: dto.paymentMethod ?? null,
          paymentReference: dto.paymentReference ?? null,
          ...(isFullyPaid ? { status: InvoiceStatus.PAID, paidAt: now } : {}),
        },
      });

      // Jurnal pembayaran invoice: Debit Kas/Bank, Credit Pendapatan
      // Jika lunas penuh dan ada PPN: tambahkan baris Debit Pendapatan, Credit Utang PPN
      const journalLines: {
        coaId: string;
        type: 'DEBIT' | 'CREDIT';
        amount: Prisma.Decimal;
        description: string;
        contactId: string | null;
      }[] = [
        {
          coaId: dto.paymentCoaId,
          type: 'DEBIT',
          amount: payNow,
          description: `Penerimaan dari invoice ${invoice.invoiceNumber}`,
          contactId: invoice.contactId ?? null,
        },
        {
          coaId: revenueCoa.id,
          type: 'CREDIT',
          amount: payNow,
          description: `Pendapatan dari invoice ${invoice.invoiceNumber}`,
          contactId: invoice.contactId ?? null,
        },
      ];

      if (isFullyPaid) {
        const taxDecimal = new Prisma.Decimal(invoice.taxAmount.toString());
        if (taxDecimal.gt(0)) {
          const taxCoa = await tx.chartOfAccount.findFirst({ where: { companyId, code: '2-002' } });
          if (taxCoa) {
            journalLines.push(
              {
                coaId: revenueCoa.id,
                type: 'DEBIT',
                amount: taxDecimal,
                description: `${invoice.taxConfig?.name ?? 'Pajak'} dari invoice ${invoice.invoiceNumber}`,
                contactId: null,
              },
              {
                coaId: taxCoa.id,
                type: 'CREDIT',
                amount: taxDecimal,
                description: `Utang ${invoice.taxConfig?.name ?? 'Pajak'} invoice ${invoice.invoiceNumber}`,
                contactId: null,
              },
            );
          }
        }
      }

      await tx.journalEntry.create({
        data: {
          companyId,
          invoiceId: id,
          isSystemGenerated: true,
          description: `Payment for invoice ${invoice.invoiceNumber}${isFullyPaid ? ' (LUNAS)' : ` (partial, sisa ${remaining.sub(payNow)})`}`,
          transactionDate: paymentDate,
          createdByUserId: userId,
          lines: { create: journalLines },
        },
      });
    });

    await this.logsService.create({
      userId,
      actionType: isFullyPaid ? LogActionType.BUSINESS_INVOICE_PAID : LogActionType.BUSINESS_INVOICE_SENT,
      entityType: 'Invoice',
      entityId: id,
      description: isFullyPaid
        ? `Invoice ${invoice.invoiceNumber} marked as PAID.`
        : `Invoice ${invoice.invoiceNumber} received partial payment of ${payNow}.`,
      details: { paymentCoaId: dto.paymentCoaId, paymentDate: dto.paymentDate, amount: payNow.toString() },
    });

    return isFullyPaid
      ? { message: `Invoice ${invoice.invoiceNumber} marked as PAID.` }
      : {
          message: `Partial payment of ${payNow} recorded. Remaining balance: ${remaining.sub(payNow)}.`,
          amountPaid: newAmountPaid.toString(),
          remaining: remaining.sub(payNow).toString(),
        };
  }

  async delete(userId: string, companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId },
      include: { attachments: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT invoices can be deleted.');
    }

    // Hapus semua attachment dari MinIO
    for (const att of invoice.attachments) {
      await this.minioService.deleteFile(att.fileUrl).catch(() => null);
    }

    await this.prisma.invoice.delete({ where: { id } });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_INVOICE_DELETED,
      entityType: 'Invoice',
      entityId: id,
      description: `Invoice ${invoice.invoiceNumber} deleted.`,
      details: null,
    });

    return { message: `Invoice ${invoice.invoiceNumber} deleted.` };
  }

  async duplicate(userId: string, company: Company, id: string) {
    const source = await this.prisma.invoice.findFirst({
      where: { id, companyId: company.id },
      include: { items: true, taxConfig: true },
    });
    if (!source) throw new NotFoundException('Invoice not found.');

    const invoiceNumber = await this.generateInvoiceNumber(company.id);
    const now = new Date();

    const duplicate = await this.prisma.invoice.create({
      data: {
        companyId: company.id,
        contactId: source.contactId,
        invoiceNumber,
        clientName: source.clientName,
        clientEmail: source.clientEmail,
        clientAddress: source.clientAddress,
        issueDate: now,
        dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // +30 hari
        status: InvoiceStatus.DRAFT,
        subtotal: source.subtotal,
        taxAmount: source.taxAmount,
        withholdingTaxAmount: source.withholdingTaxAmount,
        totalAmount: source.totalAmount,
        notes: source.notes,
        paymentBankAccountId: source.paymentBankAccountId,
        taxConfigId: source.taxConfigId ?? null,
        createdByUserId: userId,
        items: {
          create: source.items.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discountAmount: i.discountAmount,
            taxable: i.taxable,
            taxRate: i.taxRate,
            taxAmount: i.taxAmount,
            total: i.total,
          })),
        },
      },
      include: { items: true },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_INVOICE_CREATE,
      entityType: 'Invoice',
      entityId: duplicate.id,
      description: `Invoice ${duplicate.invoiceNumber} duplicated from ${source.invoiceNumber}.`,
      details: { sourceInvoiceId: source.id },
    });

    return duplicate;
  }

  // ───────────────────────────────────────────────────
  // Attachments
  // ───────────────────────────────────────────────────

  async uploadAttachment(
    userId: string,
    companyId: string,
    id: string,
    file: Express.Multer.File,
  ) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, companyId } });
    if (!invoice) throw new NotFoundException('Invoice not found.');

    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'image/jpg', 'image/webp',
      'application/pdf',
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPEG, PNG, WebP, and PDF are allowed.',
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('File size must not exceed 10MB.');
    }

    const ext = file.originalname.split('.').pop();
    const filePath = `invoice-attachments/${companyId}/${id}/${Date.now()}-${randomUUID()}.${ext}`;
    await this.minioService.uploadFile(file, filePath);

    const attachment = await this.prisma.invoiceAttachment.create({
      data: {
        invoiceId: id,
        fileName: file.originalname,
        fileUrl: filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedByUserId: userId,
      },
    });

    return attachment;
  }

  async getAttachments(companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, companyId } });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    return this.prisma.invoiceAttachment.findMany({ where: { invoiceId: id } });
  }

  async deleteAttachment(
    companyId: string,
    invoiceId: string,
    attachmentId: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, companyId } });
    if (!invoice) throw new NotFoundException('Invoice not found.');

    const attachment = await this.prisma.invoiceAttachment.findFirst({
      where: { id: attachmentId, invoiceId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');

    await this.minioService.deleteFile(attachment.fileUrl).catch(() => null);
    await this.prisma.invoiceAttachment.delete({ where: { id: attachmentId } });

    return { message: 'Attachment deleted.' };
  }
}
