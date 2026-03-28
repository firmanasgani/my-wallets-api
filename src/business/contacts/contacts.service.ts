import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Company, ContactType, LogActionType } from '@prisma/client';
import { LogsService } from '../../logs/logs.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    private prisma: PrismaService,
    private logsService: LogsService,
  ) {}

  async findAll(
    company: Company,
    type?: ContactType,
    search?: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      companyId: company.id,
      ...(type ? { type } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.contact.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit }),
      this.prisma.contact.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(companyId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, companyId },
    });
    if (!contact) throw new NotFoundException('Contact not found.');
    return contact;
  }

  async create(userId: string, company: Company, dto: CreateContactDto) {
    const contact = await this.prisma.contact.create({
      data: {
        companyId: company.id,
        ...dto,
      },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_CONTACT_CREATE,
      entityType: 'Contact',
      entityId: contact.id,
      description: `Contact "${contact.name}" (${contact.type}) created in company "${company.name}".`,
      details: null,
    });

    return contact;
  }

  async update(userId: string, companyId: string, id: string, dto: UpdateContactDto) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, companyId },
    });
    if (!contact) throw new NotFoundException('Contact not found.');

    const updated = await this.prisma.contact.update({
      where: { id },
      data: dto,
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_CONTACT_UPDATE,
      entityType: 'Contact',
      entityId: id,
      description: `Contact "${updated.name}" updated.`,
      details: null,
    });

    return updated;
  }

  async delete(userId: string, companyId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, companyId },
    });
    if (!contact) throw new NotFoundException('Contact not found.');

    // Guard: tidak bisa hapus jika ada Invoice atau BusinessTransaction yang mereferensikan
    const invoiceCount = await this.prisma.invoice.count({ where: { contactId: id } });
    if (invoiceCount > 0) {
      throw new BadRequestException(
        'Cannot delete contact because it is referenced by existing invoices.',
      );
    }

    const txCount = await this.prisma.journalLine.count({ where: { contactId: id } });
    if (txCount > 0) {
      throw new BadRequestException(
        'Cannot delete contact because it is referenced by existing transactions.',
      );
    }

    await this.prisma.contact.delete({ where: { id } });

    await this.logsService.create({
      userId,
      actionType: LogActionType.BUSINESS_CONTACT_DELETE,
      entityType: 'Contact',
      entityId: id,
      description: `Contact "${contact.name}" deleted.`,
      details: null,
    });

    return { message: 'Contact deleted.' };
  }
}
