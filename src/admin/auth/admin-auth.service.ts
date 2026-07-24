import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Admin } from '@prisma/client';
import { AdminsService } from 'src/admin/admins/admins.service';
import { LogsService } from 'src/logs/logs.service';
import { LogActionType } from '@prisma/client';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly adminsService: AdminsService,
    private readonly jwtService: JwtService,
    private readonly logsService: LogsService,
  ) {}

  async validateAdmin(
    login: string,
    pass: string,
  ): Promise<Omit<Admin, 'passwordHash'> | null> {
    const admin = await this.adminsService.findByLogin(login);
    if (!admin || !admin.isActive) return null;

    const passwordMatches = await bcrypt.compare(pass, admin.passwordHash);
    if (!passwordMatches) return null;

    const { passwordHash, ...result } = admin;
    return result;
  }

  async login(
    admin: Omit<Admin, 'passwordHash'>,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const payload = {
      sub: admin.id,
      username: admin.username,
      role: admin.role,
    };

    await this.adminsService.updateLastLogin(admin.id);

    await this.logsService.create({
      adminId: admin.id,
      actionType: LogActionType.ADMIN_LOGIN,
      entityType: 'Admin',
      entityId: admin.id,
      description: `Admin ${admin.username} logged in`,
      details: { username: admin.username, role: admin.role },
      ipAddress: ipAddress ?? '',
      userAgent: userAgent ?? '',
    });

    return {
      access_token: this.jwtService.sign(payload),
      admin,
    };
  }
}
