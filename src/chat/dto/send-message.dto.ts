import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendMessageDto {
  /** Required when sending as an admin — identifies which thread to post to. */
  @IsOptional()
  @IsUUID('4')
  conversationId?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(4000)
  content: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}
