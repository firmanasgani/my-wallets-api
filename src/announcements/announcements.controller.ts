import { Controller, Get } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get('active')
  findActive() {
    return this.announcementsService.findActive();
  }
}
