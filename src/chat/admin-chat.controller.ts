import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';
import { AdminJwtAuthGuard } from 'src/admin/auth/guards/admin-jwt-auth.guard';
import { ConversationStatus } from '@prisma/client';
import { ChatService } from './chat.service';

@Public()
@Controller('chat/conversations')
@UseGuards(AdminJwtAuthGuard)
export class AdminChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  findAll(@Query('status') status?: ConversationStatus) {
    return this.chatService.findConversations({ status });
  }

  @Get(':id/messages')
  getMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getMessages(
      id,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
