import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AdminsService } from 'src/admin/admins/admins.service';
import { AdminJwtPayload } from '../interfaces/admin-jwt-payload.interface';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly adminsService: AdminsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('ADMIN_JWT_SECRET') || 'admin-secret',
    });
  }

  async validate(payload: AdminJwtPayload) {
    const admin = await this.adminsService.findById(payload.sub);
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Admin not found or account disabled');
    }
    const { passwordHash, ...result } = admin;
    return result;
  }
}
