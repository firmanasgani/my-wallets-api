import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EmailBlastStatus, LogActionType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { LogsService } from 'src/logs/logs.service';
import { MailService } from 'src/mail/mail.service';
import { CreateEmailBlastDto } from './dto/create-email-blast.dto';
import { UpdateEmailBlastDto } from './dto/update-email-blast.dto';

const EDITABLE_STATUSES: EmailBlastStatus[] = [
  EmailBlastStatus.DRAFT,
  EmailBlastStatus.SCHEDULED,
];

@Injectable()
export class EmailBlastsService {
  private readonly logger = new Logger(EmailBlastsService.name);

  constructor(
    private prisma: PrismaService,
    private logsService: LogsService,
    private mailService: MailService,
  ) {}

  findAll() {
    return this.prisma.emailBlast.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, username: true } } },
    });
  }

  async findOne(id: string) {
    const blast = await this.prisma.emailBlast.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, username: true } },
        recipients: {
          select: {
            id: true,
            userId: true,
            email: true,
            status: true,
            sentAt: true,
            error: true,
          },
        },
      },
    });
    if (!blast) throw new NotFoundException('Email blast not found');
    return blast;
  }

  async create(dto: CreateEmailBlastDto, adminId: string) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: dto.userIds } },
      select: { id: true, email: true },
    });
    if (users.length === 0) {
      throw new BadRequestException('No valid recipients found.');
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;
    const status = scheduledAt
      ? EmailBlastStatus.SCHEDULED
      : EmailBlastStatus.DRAFT;

    const blast = await this.prisma.emailBlast.create({
      data: {
        subject: dto.subject,
        content: dto.content,
        status,
        scheduledAt,
        totalRecipients: users.length,
        createdByAdminId: adminId,
        recipients: {
          create: users.map((user) => ({ userId: user.id, email: user.email })),
        },
      },
      include: { recipients: true },
    });

    await this.logsService.create({
      adminId,
      actionType: LogActionType.EMAIL_BLAST_CREATE,
      entityType: 'EmailBlast',
      entityId: blast.id,
      description: `Email blast "${blast.subject}" created for ${users.length} recipient(s)`,
      details: { scheduledAt: dto.scheduledAt ?? null },
    });

    return blast;
  }

  async update(id: string, dto: UpdateEmailBlastDto, adminId: string) {
    const existing = await this.prisma.emailBlast.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Email blast not found');
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(
        'Only draft or scheduled blasts can be edited.',
      );
    }

    let totalRecipients = existing.totalRecipients;
    if (dto.userIds) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: dto.userIds } },
        select: { id: true, email: true },
      });
      if (users.length === 0) {
        throw new BadRequestException('No valid recipients found.');
      }
      await this.prisma.emailBlastRecipient.deleteMany({
        where: { emailBlastId: id },
      });
      await this.prisma.emailBlastRecipient.createMany({
        data: users.map((user) => ({
          emailBlastId: id,
          userId: user.id,
          email: user.email,
        })),
      });
      totalRecipients = users.length;
    }

    let status = existing.status;
    let scheduledAt = existing.scheduledAt;
    if (dto.scheduledAt === null) {
      status = EmailBlastStatus.DRAFT;
      scheduledAt = null;
    } else if (dto.scheduledAt) {
      status = EmailBlastStatus.SCHEDULED;
      scheduledAt = new Date(dto.scheduledAt);
    }

    const updated = await this.prisma.emailBlast.update({
      where: { id },
      data: {
        subject: dto.subject,
        content: dto.content,
        status,
        scheduledAt,
        totalRecipients,
      },
      include: { recipients: true },
    });

    await this.logsService.create({
      adminId,
      actionType: LogActionType.EMAIL_BLAST_UPDATE,
      entityType: 'EmailBlast',
      entityId: id,
      description: `Email blast "${updated.subject}" updated`,
    });

    return updated;
  }

  async unschedule(id: string, adminId: string) {
    const existing = await this.prisma.emailBlast.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Email blast not found');
    if (existing.status !== EmailBlastStatus.SCHEDULED) {
      throw new BadRequestException(
        'Only scheduled blasts can be unscheduled.',
      );
    }

    const updated = await this.prisma.emailBlast.update({
      where: { id },
      data: { status: EmailBlastStatus.DRAFT, scheduledAt: null },
    });

    await this.logsService.create({
      adminId,
      actionType: LogActionType.EMAIL_BLAST_CANCEL,
      entityType: 'EmailBlast',
      entityId: id,
      description: `Email blast "${updated.subject}" unscheduled`,
    });

    return updated;
  }

  async remove(id: string, adminId: string) {
    const existing = await this.prisma.emailBlast.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Email blast not found');
    if (existing.status === EmailBlastStatus.SENDING) {
      throw new BadRequestException(
        'Cannot delete a blast while it is sending.',
      );
    }

    await this.prisma.emailBlast.delete({ where: { id } });

    await this.logsService.create({
      adminId,
      actionType: LogActionType.EMAIL_BLAST_DELETE,
      entityType: 'EmailBlast',
      entityId: id,
      description: `Email blast "${existing.subject}" deleted`,
    });

    return { message: 'Email blast deleted' };
  }

  async sendNow(id: string) {
    const existing = await this.prisma.emailBlast.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Email blast not found');
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(
        'Only draft or scheduled blasts can be sent.',
      );
    }

    // Fire-and-forget: sendBlast() claims the row atomically, so the cron
    // sweeping scheduled blasts can never double-send this one.
    void this.sendBlast(id).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to send blast ${id}: ${message}`);
    });

    return { message: 'Sending started' };
  }

  /** Sweeps for scheduled blasts whose time has come; called by EmailBlastCron every minute. */
  async processDueScheduledBlasts() {
    const due = await this.prisma.emailBlast.findMany({
      where: {
        status: EmailBlastStatus.SCHEDULED,
        scheduledAt: { lte: new Date() },
      },
      select: { id: true },
    });

    for (const blast of due) {
      await this.sendBlast(blast.id);
    }
  }

  private async sendBlast(id: string) {
    // Atomic claim: only one caller (cron or manual send-now) gets to move
    // this blast into SENDING, so it can never be processed twice.
    const claimed = await this.prisma.emailBlast.updateMany({
      where: { id, status: { in: EDITABLE_STATUSES } },
      data: { status: EmailBlastStatus.SENDING },
    });
    if (claimed.count === 0) return;

    const blast = await this.prisma.emailBlast.findUnique({
      where: { id },
      include: { recipients: { where: { status: 'PENDING' } } },
    });
    if (!blast) return;

    const results = await this.mailService.sendBatch(
      blast.recipients.map((recipient) => ({
        to: recipient.email,
        subject: blast.subject,
        html: blast.content,
      })),
    );

    let sentCount = 0;
    let failedCount = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const recipient = blast.recipients[i];
      if (result.success) {
        sentCount++;
        await this.prisma.emailBlastRecipient.update({
          where: { id: recipient.id },
          data: { status: 'SENT', sentAt: new Date() },
        });
      } else {
        failedCount++;
        await this.prisma.emailBlastRecipient.update({
          where: { id: recipient.id },
          data: { status: 'FAILED', error: result.error?.slice(0, 500) },
        });
      }
    }

    const finalStatus =
      failedCount > 0 && sentCount === 0
        ? EmailBlastStatus.FAILED
        : EmailBlastStatus.SENT;

    await this.prisma.emailBlast.update({
      where: { id },
      data: {
        status: finalStatus,
        sentAt: new Date(),
        sentCount: { increment: sentCount },
        failedCount: { increment: failedCount },
        errorMessage:
          finalStatus === EmailBlastStatus.FAILED
            ? 'All recipients failed to send.'
            : null,
      },
    });

    await this.logsService.create({
      adminId: blast.createdByAdminId,
      actionType:
        finalStatus === EmailBlastStatus.SENT
          ? LogActionType.EMAIL_BLAST_SENT
          : LogActionType.EMAIL_BLAST_FAILED,
      entityType: 'EmailBlast',
      entityId: id,
      description: `Email blast "${blast.subject}" ${finalStatus === EmailBlastStatus.SENT ? 'sent' : 'failed'} (${sentCount} sent, ${failedCount} failed)`,
    });
  }
}
