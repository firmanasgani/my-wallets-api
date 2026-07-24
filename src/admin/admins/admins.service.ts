import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';
import { Admin, AdminRole, LogActionType, Prisma } from '@prisma/client';
import { LogsService } from 'src/logs/logs.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';

@Injectable()
export class AdminsService {
  constructor(
    private prisma: PrismaService,
    private logsService: LogsService,
  ) {}

  async findByLogin(login: string): Promise<Admin | null> {
    return this.prisma.admin.findFirst({
      where: {
        OR: [{ email: login }, { username: login }],
      },
    });
  }

  async findById(id: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({ where: { id } });
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.prisma.admin.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  async findAll() {
    const admins = await this.prisma.admin.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return admins.map(({ passwordHash, ...rest }) => rest);
  }

  async findOne(id: string) {
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('Admin not found');
    const { passwordHash, ...rest } = admin;
    return rest;
  }

  async create(dto: CreateAdminDto, actingAdminId: string) {
    const existing = await this.prisma.admin.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException('Email or username already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const admin = await this.prisma.admin.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        role: dto.role,
        createdByAdminId: actingAdminId,
      },
    });

    await this.logsService.create({
      adminId: actingAdminId,
      actionType: LogActionType.ADMIN_CREATE,
      entityType: 'Admin',
      entityId: admin.id,
      description: `Admin ${admin.username} created with role ${admin.role}`,
      details: { username: admin.username, role: admin.role },
    });

    const { passwordHash: _, ...rest } = admin;
    return rest;
  }

  async update(id: string, dto: UpdateAdminDto, actingAdminId: string) {
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('Admin not found');

    if (
      admin.role === AdminRole.SUPERADMIN &&
      (dto.role !== undefined && dto.role !== AdminRole.SUPERADMIN)
    ) {
      await this.assertNotLastSuperadmin(id);
    }
    if (admin.role === AdminRole.SUPERADMIN && dto.isActive === false) {
      await this.assertNotLastSuperadmin(id);
    }

    const data: Prisma.AdminUpdateInput = {
      fullName: dto.fullName,
      role: dto.role,
      isActive: dto.isActive,
    };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const updated = await this.prisma.admin.update({ where: { id }, data });

    await this.logsService.create({
      adminId: actingAdminId,
      actionType: LogActionType.ADMIN_UPDATE,
      entityType: 'Admin',
      entityId: updated.id,
      description: `Admin ${updated.username} updated`,
      details: { changes: { ...dto, password: dto.password ? '***' : undefined } },
    });

    const { passwordHash, ...rest } = updated;
    return rest;
  }

  async deactivate(id: string, actingAdminId: string) {
    if (id === actingAdminId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('Admin not found');

    if (admin.role === AdminRole.SUPERADMIN) {
      await this.assertNotLastSuperadmin(id);
    }

    const updated = await this.prisma.admin.update({
      where: { id },
      data: { isActive: false },
    });

    await this.logsService.create({
      adminId: actingAdminId,
      actionType: LogActionType.ADMIN_DEACTIVATE,
      entityType: 'Admin',
      entityId: updated.id,
      description: `Admin ${updated.username} deactivated`,
    });

    const { passwordHash, ...rest } = updated;
    return rest;
  }

  async activate(id: string, actingAdminId: string) {
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundException('Admin not found');

    const updated = await this.prisma.admin.update({
      where: { id },
      data: { isActive: true },
    });

    await this.logsService.create({
      adminId: actingAdminId,
      actionType: LogActionType.ADMIN_ACTIVATE,
      entityType: 'Admin',
      entityId: updated.id,
      description: `Admin ${updated.username} reactivated`,
    });

    const { passwordHash, ...rest } = updated;
    return rest;
  }

  private async assertNotLastSuperadmin(excludingId: string) {
    const otherActiveSuperadmins = await this.prisma.admin.count({
      where: {
        role: AdminRole.SUPERADMIN,
        isActive: true,
        id: { not: excludingId },
      },
    });
    if (otherActiveSuperadmins === 0) {
      throw new ForbiddenException(
        'Cannot remove/demote/deactivate the last remaining SUPERADMIN',
      );
    }
  }
}
