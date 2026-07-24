import { Controller, Get, Query } from '@nestjs/common';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * User-side initial load: their single support thread + recent history.
   * Live delivery after this happens over the /chat Socket.IO namespace.
   */
  @Get('my-conversation')
  async myConversation(
    @GetUser() user: Omit<User, 'passwordHash'>,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const conversation = await this.chatService.getOrCreateConversationForUser(
      user.id,
    );
    return this.chatService.getMessages(
      conversation.id,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
