import { Injectable, NotFoundException } from '@nestjs/common';
import { LogActionType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { LogsService } from 'src/logs/logs.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private logsService: LogsService,
  ) {}

  /** Public/customer-facing: currently active announcements to show in-app. */
  findActive() {
    const now = new Date();
    return this.prisma.announcement.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      orderBy: { startsAt: 'desc' },
    });
  }

  findAll() {
    return this.prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, username: true } } },
    });
  }

  async findOne(id: string) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement) throw new NotFoundException('Announcement not found');
    return announcement;
  }

  async create(dto: CreateAnnouncementDto, adminId: string) {
    const announcement = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        content: dto.content,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        createdByAdminId: adminId,
      },
    });

    await this.logsService.create({
      adminId,
      actionType: LogActionType.ANNOUNCEMENT_CREATE,
      entityType: 'Announcement',
      entityId: announcement.id,
      description: `Announcement "${announcement.title}" created`,
    });

    return announcement;
  }

  async update(id: string, dto: UpdateAnnouncementDto, adminId: string) {
    const existing = await this.prisma.announcement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Announcement not found');

    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        isActive: dto.isActive,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });

    await this.logsService.create({
      adminId,
      actionType: LogActionType.ANNOUNCEMENT_UPDATE,
      entityType: 'Announcement',
      entityId: updated.id,
      description: `Announcement "${updated.title}" updated`,
    });

    return updated;
  }

  async remove(id: string, adminId: string) {
    const existing = await this.prisma.announcement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Announcement not found');

    await this.prisma.announcement.delete({ where: { id } });

    await this.logsService.create({
      adminId,
      actionType: LogActionType.ANNOUNCEMENT_DELETE,
      entityType: 'Announcement',
      entityId: id,
      description: `Announcement "${existing.title}" deleted`,
    });

    return { message: 'Announcement deleted' };
  }
}
