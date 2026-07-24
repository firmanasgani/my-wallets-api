import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import * as jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import { MessageSenderType } from '@prisma/client';
import { UsersService } from 'src/users/users.service';
import { AdminsService } from 'src/admin/admins/admins.service';
import { ChatService, redactSenderAdmin } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

interface ChatActor {
  type: 'user' | 'admin';
  id: string;
}

@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
export class ChatGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private static readonly ADMINS_ROOM = 'admins';

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly adminsService: AdminsService,
    private readonly chatService: ChatService,
  ) {}

  /**
   * Authenticate via a Socket.IO connection middleware rather than
   * `handleConnection` — middleware runs to completion *before* the
   * handshake finishes and the client's `connect` event fires, so
   * `client.data.actor` is guaranteed to be set before the client can
   * emit anything. Doing this in `handleConnection` instead left a race:
   * the client's `connect` fires as soon as the transport upgrades, which
   * can beat the async DB lookup used to resolve the actor.
   */
  afterInit(server: Server) {
    server.use((socket: Socket, next) => {
      this.authenticateSocket(socket)
        .then(() => next())
        .catch((err) => next(err instanceof Error ? err : new Error(String(err))));
    });
  }

  private async authenticateSocket(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    const actor = await this.authenticate(token);
    client.data.actor = actor;

    if (actor.type === 'user') {
      const conversation = await this.chatService.getOrCreateConversationForUser(actor.id);
      client.data.conversationId = conversation.id;
      client.join(`conversation:${conversation.id}`);
    } else {
      client.join(ChatGateway.ADMINS_ROOM);
    }
  }

  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const actor: ChatActor | undefined = client.data.actor;
    if (!actor || actor.type !== 'admin') {
      client.emit('error', { message: 'Only admins can join arbitrary threads' });
      return;
    }
    client.join(`conversation:${data.conversationId}`);
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const actor: ChatActor | undefined = client.data.actor;
    if (!actor) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    const message =
      actor.type === 'user'
        ? await this.chatService.sendMessageAsUser(
            actor.id,
            dto.content,
            dto.attachmentUrl,
          )
        : await this.chatService.sendMessageAsAdmin(
            actor.id,
            dto.conversationId!,
            dto.content,
            dto.attachmentUrl,
          );

    await this.broadcastNewMessage(message);
  }

  /**
   * Sends the full message (with sender-admin identity) to admin sockets,
   * and a redacted copy (identity stripped — admin-only info) to the
   * customer. Rooms overlap (an admin viewing this thread is in both the
   * conversation room and the admins room), so we resolve sockets once and
   * emit per-socket instead of a single shared `.to().emit()` payload.
   */
  private async broadcastNewMessage(message: Awaited<ReturnType<ChatService['sendMessageAsUser']>>) {
    const [conversationSockets, adminSockets] = await Promise.all([
      this.server.in(`conversation:${message.conversationId}`).fetchSockets(),
      this.server.in(ChatGateway.ADMINS_ROOM).fetchSockets(),
    ]);

    const targets = new Map<string, (typeof conversationSockets)[number]>();
    for (const socket of [...conversationSockets, ...adminSockets]) {
      targets.set(socket.id, socket);
    }

    const redacted = redactSenderAdmin(message);
    for (const socket of targets.values()) {
      const isAdmin = (socket.data as { actor?: ChatActor }).actor?.type === 'admin';
      socket.emit('newMessage', isAdmin ? message : redacted);
    }
  }

  @SubscribeMessage('markRead')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const actor: ChatActor | undefined = client.data.actor;
    if (!actor) return;

    const readerType =
      actor.type === 'user' ? MessageSenderType.USER : MessageSenderType.ADMIN;
    await this.chatService.markRead(data.conversationId, readerType);
    this.server
      .to(`conversation:${data.conversationId}`)
      .emit('messagesRead', { conversationId: data.conversationId, readerType });
  }

  private extractToken(client: Socket): string {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;

    const header = client.handshake.headers?.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);

    throw new UnauthorizedException('No token provided');
  }

  private async authenticate(token: string): Promise<ChatActor> {
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
