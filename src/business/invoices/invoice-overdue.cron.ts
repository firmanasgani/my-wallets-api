import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvoiceStatus, LogActionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LogsService } from '../../logs/logs.service';

@Injectable()
export class InvoiceOverdueCron {
  private readonly logger = new Logger(InvoiceOverdueCron.name);

  constructor(
    private prisma: PrismaService,
    private logsService: LogsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleOverdueInvoices() {
    this.logger.debug('Running invoice overdue check...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.SENT,
        dueDate: { lt: today },
      },
      select: { id: true, invoiceNumber: true, companyId: true, dueDate: true },
    });

    if (overdueInvoices.length === 0) {
      this.logger.debug('No overdue invoices found.');
      return;
    }

    this.logger.log(`Marking ${overdueInvoices.length} invoice(s) as OVERDUE.`);

    await this.prisma.invoice.updateMany({
      where: { id: { in: overdueInvoices.map((inv) => inv.id) } },
      data: { status: InvoiceStatus.OVERDUE },
    });

    for (const inv of overdueInvoices) {
      await this.logsService.create({
        actionType: LogActionType.BUSINESS_INVOICE_OVERDUE,
        entityType: 'Invoice',
        entityId: inv.id,
        description: `Invoice ${inv.invoiceNumber} automatically marked as OVERDUE (due date: ${inv.dueDate.toISOString().split('T')[0]}).`,
        details: { companyId: inv.companyId, dueDate: inv.dueDate.toISOString() },
      });
    }

    this.logger.log(`Done. ${overdueInvoices.length} invoice(s) marked as OVERDUE.`);
  }
}
