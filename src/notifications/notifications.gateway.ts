import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import * as jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import { AdminNotification, UserNotification } from '@prisma/client';
import { UsersService } from 'src/users/users.service';
import { AdminsService } from 'src/admin/admins/admins.service';

interface NotificationActor {
  type: 'user' | 'admin';
  id: string;
}

/**
 * Web delivery only — see NOTIFICATION_SYSTEM_PLAN.md §2/§4. Mobile push
 * goes through the FCM queue (delivery/fcm.service.ts + notifications.cron.ts)
 * instead, never through this gateway.
 */
@WebSocketGateway({ namespace: '/notifications', cors: { origin: '*' } })
export class NotificationsGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly adminsService: AdminsService,
  ) {}

  afterInit(server: Server) {
    server.use((socket: Socket, next) => {
      this.authenticateSocket(socket)
        .then(() => next())
        .catch((err) =>
          next(err instanceof Error ? err : new Error(String(err))),
        );
    });
  }

  private async authenticateSocket(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    const actor = await this.authenticate(token);
    client.data.actor = actor;
    client.join(
      actor.type === 'user' ? `user:${actor.id}` : `admin:${actor.id}`,
    );
  }

  @OnEvent('user-notification.created')
  handleUserNotificationCreated(notification: UserNotification) {
    this.server
      .to(`user:${notification.userId}`)
      .emit('notification:new', notification);
  }

  @OnEvent('admin-notification.created')
  handleAdminNotificationCreated(notification: AdminNotification) {
    this.server
      .to(`admin:${notification.adminId}`)
      .emit('notification:new', notification);
  }

  private extractToken(client: Socket): string {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;

    const header = client.handshake.headers?.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);

    throw new UnauthorizedException('No token provided');
  }

  private async authenticate(token: string): Promise<NotificationActor> {
    const userSecret = this.configService.get<string>('JWT_SECRET') || 'secret';
    const adminSecret =
      this.configService.get<string>('ADMIN_JWT_SECRET') || 'admin-secret';

    try {
      const payload = jwt.verify(token, userSecret) as { sub: string };
      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }
      return { type: 'user', id: user.id };
    } catch (userErr) {
      // Not a valid user token — try the admin secret before giving up.
    }

    const payload = jwt.verify(token, adminSecret) as { sub: string };
    const admin = await this.adminsService.findById(payload.sub);
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Admin not found or inactive');
    }
    return { type: 'admin', id: admin.id };
  }
}
