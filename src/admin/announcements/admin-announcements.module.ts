import { Module } from '@nestjs/common';
import { AdminAnnouncementsController } from './admin-announcements.controller';
import { AnnouncementsModule } from 'src/announcements/announcements.module';
import { AdminAuthModule } from '../auth/admin-auth.module';

@Module({
  imports: [AnnouncementsModule, AdminAuthModule],
  controllers: [AdminAnnouncementsController],
})
export class AdminAnnouncementsModule {}
