import { Injectable, NotFoundException } from '@nestjs/common';
import { ConversationStatus, MessageSenderType, Message, Admin } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

type MessageWithSenderAdmin = Message & {
  senderAdmin: Pick<Admin, 'id' | 'username' | 'fullName'> | null;
};

/**
 * The admin's identity is admin-only information (see ChatGateway/ChatController
 * usage) — customers must never receive it, over REST or the live socket.
 */
export function redactSenderAdmin(message: MessageWithSenderAdmin): MessageWithSenderAdmin {
  return { ...message, senderAdmin: null };
}

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async getOrCreateConversationForUser(userId: string) {
    const existing = await this.prisma.conversation.findUnique({
      where: { userId },
    });
    if (existing) return existing;

    return this.prisma.conversation.create({ data: { userId } });
  }

  async findConversations(params: { status?: ConversationStatus }) {
    const conversations = await this.prisma.conversation.findMany({
      where: params.status ? { status: params.status } : undefined,
      orderBy: { lastMessageAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, email: true, fullName: true } },
        assignedAdmin: { select: { id: true, username: true } },
        _count: {
          select: {
            messages: {
              where: { senderType: MessageSenderType.USER, isRead: false },
            },
          },
        },
      },
    });

    return conversations.map(({ _count, ...conversation }) => ({
      ...conversation,
      unreadCount: _count.messages,
    }));
  }

  async getMessages(conversationId: string, page = 1, limit = 30) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          senderAdmin: { select: { id: true, username: true, fullName: true } },
        },
      }),
      this.prisma.message.count({ where: { conversationId } }),
    ]);

    return {
      conversation,
      data: data.reverse(),
      meta: { total, page, limit, lastPage: Math.ceil(total / limit) },
    };
  }

  async sendMessageAsUser(
    userId: string,
    content: string,
    attachmentUrl?: string,
  ) {
    const conversation = await this.getOrCreateConversationForUser(userId);

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: MessageSenderType.USER,
        senderUserId: userId,
        content,
        attachmentUrl,
      },
      include: {
        senderAdmin: { select: { id: true, username: true, fullName: true } },
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: message.createdAt, status: ConversationStatus.OPEN },
    });

    return message;
  }

  async sendMessageAsAdmin(
    adminId: string,
    conversationId: string,
    content: string,
    attachmentUrl?: string,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderType: MessageSenderType.ADMIN,
        senderAdminId: adminId,
        content,
        attachmentUrl,
      },
      include: {
        senderAdmin: { select: { id: true, username: true, fullName: true } },
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: message.createdAt,
        assignedAdminId: conversation.assignedAdminId ?? adminId,
      },
    });

    return message;
  }

  async markRead(conversationId: string, readerType: MessageSenderType) {
    const opposingSender =
      readerType === MessageSenderType.USER
        ? MessageSenderType.ADMIN
        : MessageSenderType.USER;

    await this.prisma.message.updateMany({
      where: { conversationId, senderType: opposingSender, isRead: false },
      data: { isRead: true },
    });
  }
}
